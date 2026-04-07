import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { User } from '@/database/schemas/user.schema';
import { Campus } from '@/database/schemas/campus.schema';
import { Role } from '@/database/schemas/role.schema';
import { Permission } from '@/database/schemas/permission.schema';
import { RolePermission } from '@/database/schemas/role-permission.schema';
import { FaceTemplate } from '@/database/schemas/face-template.schema';
import { ResetPasswordToken } from '@/database/schemas/reset-password-token.schema';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from '@/common/interfaces/auth.interface';
import { SetPasswordDto } from './dto/set-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LoginWithPasswordDto } from './dto/login-with-password.dto';

const DEV_EMBEDDING_DIMENSION = 128;
const DEFAULT_VERIFY_SIMILARITY_THRESHOLD = 0.88;
const DEFAULT_REGISTER_DUPLICATE_THRESHOLD = 0.94;
const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const DEFAULT_FACE_SCAN_SESSION_TTL_MS = 300_000;
const DEFAULT_FACE_SCAN_MIN_FRAMES = 4;
const DEFAULT_FACE_SCAN_MIN_DURATION_MS = 4_500;
const DEFAULT_FACE_SCAN_STEP_TIMEOUT_MS = 20_000;
const DEFAULT_FACE_SCAN_MIN_DETECTOR_SCORE = 0.55;
const DEFAULT_FACE_SCAN_MIN_BBOX_AREA = 12_000;
const DEFAULT_FACE_SCAN_MAX_ABS_PITCH = 20;
const DEFAULT_FACE_SCAN_MAX_ABS_ROLL = 20;
const DEFAULT_FACE_SCAN_LIVENESS_THRESHOLD = 0.55;
const DEFAULT_FACE_SCAN_TURN_YAW_THRESHOLD = 12;
const DEFAULT_FACE_SCAN_TURN_OFFSET_THRESHOLD = 14;

type FaceScanChallengeStep = 'center' | 'turn-left' | 'turn-right' | 'center-hold';

type FaceScanStepRule = {
  step: FaceScanChallengeStep;
  requiredFrames: number;
  timeoutMs: number;
};

type FaceAnalysis = {
  embedding: number[];
  detectorScore: number | null;
  poseYaw: number | null;
  posePitch: number | null;
  poseRoll: number | null;
  bboxCenterX: number | null;
  bboxArea: number | null;
};

type FaceScanSession = {
  sessionId: string;
  userId: string;
  stepRules: FaceScanStepRule[];
  currentStepIndex: number;
  currentStepPassFrames: number;
  currentStepStartedAt: number;
  createdAt: number;
  expiresAt: number;
  frames: FaceAnalysis[];
  baselineCenterX: number | null;
  lastTurnDirectionSign: -1 | 1 | null;
  firstFrameAt: number | null;
  lastFrameAt: number | null;
};

type FaceScanLivenessMetrics = {
  score: number;
  detectorAverage: number;
  embeddingDiversity: number;
  yawRange: number;
  centerXRange: number;
  bboxAreaAverage: number;
  durationMs: number;
  challengeCompleted: boolean;
};

type EmbeddingProviderResponse = {
  embedding?: unknown;
  faces?: Array<Record<string, unknown>>;
  result?: {
    embedding?: unknown;
    faces?: Array<Record<string, unknown>>;
  };
  data?: {
    embedding?: unknown;
    detectorScore?: unknown;
    poseYaw?: unknown;
    posePitch?: unknown;
    poseRoll?: unknown;
    bboxCenterX?: unknown;
    bboxArea?: unknown;
    facePose?: unknown;
    face_pose?: unknown;
    face?: {
      embedding?: unknown;
      normedEmbedding?: unknown;
      normed_embedding?: unknown;
      detectorScore?: unknown;
      poseYaw?: unknown;
      posePitch?: unknown;
      poseRoll?: unknown;
      bboxCenterX?: unknown;
      bboxArea?: unknown;
      pose?: unknown;
    };
    faces?: Array<Record<string, unknown>>;
  };
};
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly faceScanSessions = new Map<string, FaceScanSession>();

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Campus.name) private campusModel: Model<Campus>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(Permission.name) private permissionModel: Model<Permission>,
    @InjectModel(RolePermission.name) private rolePermissionModel: Model<RolePermission>,
    @InjectModel(FaceTemplate.name) private faceTemplateModel: Model<FaceTemplate>,
    @InjectModel(ResetPasswordToken.name)
    private resetPasswordTokenModel: Model<ResetPasswordToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Validate and login user with Google
   */
  async validateGoogleUser(googleProfile: any, campusId: string): Promise<AuthResponseDto> {
    const { googleId, email, fullName, avatar } = googleProfile;

    // Normalize email to lowercase for comparison
    const normalizedEmail = email.toLowerCase();

    // 1. Validate campus exists
    const campus = await this.campusModel.findById(campusId);
    if (!campus || !campus.isActive) {
      throw new BadRequestException('Invalid or inactive campus');
    }

    // 2. Find user by email (case-insensitive)
    const user = await this.userModel
      .findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } })
      .populate('campusId', 'campusCode campusName address')
      .exec();

    if (!user) {
      throw new UnauthorizedException('Email not found in system. Please contact administrator.');
    }

    // 3. Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    // 4. Update googleId and campusId if first time login with Google
    if (!user.googleId) {
      user.googleId = googleId;
      user.avatar = avatar || user.avatar;

      // Only update campusId if user doesn't have one yet
      if (!user.campusId) {
        user.campusId = campusId as any;
      }

      await user.save();
    } else {
      // Update avatar if changed
      if (avatar && user.avatar !== avatar) {
        user.avatar = avatar;
        await user.save();
      }
    }

    // 5. Populate campus data and role for JWT
    const populatedUser = await this.userModel
      .findById(user._id)
      .populate('campusId', 'campusCode campusName address')
      .populate('roleId', 'roleCode roleLevel roleName canAccessWeb scope description')
      .exec();

    // 6. Get permissions for this role
    let roleDetails = null;
    let permissions = [];
    let permissionCodes = [];

    if (populatedUser.roleId) {
      const role = populatedUser.roleId as any;
      roleDetails = {
        id: role._id.toString(),
        roleCode: role.roleCode,
        roleName: role.roleName,
        roleLevel: role.roleLevel,
        scope: role.scope,
        canAccessWeb: role.canAccessWeb || false,
        description: role.description,
      };

      // Get role-permission mappings
      const rolePermissions = await this.rolePermissionModel
        .find({ roleId: role._id })
        .populate('permissionId')
        .exec();

      // Extract permission details
      permissions = rolePermissions
        .filter((rp) => rp.permissionId) // Ensure permission exists
        .map((rp) => {
          const perm = rp.permissionId as any;
          return {
            id: perm._id.toString(),
            permissionCode: perm.permissionCode,
            permissionName: perm.permissionName,
            resource: perm.resource,
            action: perm.action,
            description: perm.description,
          };
        });

      // Extract permission names for JWT (not codes!)
      permissionCodes = permissions.map((p) => p.permissionName);
    }

    // 7. Generate JWT token with full payload
    const payload: JwtPayload = {
      sub: populatedUser._id.toString(),
      email: populatedUser.email,
      roleCode: roleDetails?.roleCode || 'STUDENT',
      roleLevel: roleDetails?.roleLevel || 4,
      roleScope: roleDetails?.scope || 'SELF',
      campusId: populatedUser.campusId?._id?.toString() || null,
      permissions: permissionCodes,
    };

    const accessToken = this.jwtService.sign(payload);
    const hasFaceTemplate = await this.faceTemplateModel.exists({ userId: populatedUser._id });
    const hasFingerTemplate = await this.userModel.exists({
      _id: populatedUser._id,
      fingerprintData: { $exists: true, $nin: ['', null] },
    });

    // 8. Return response with role and permissions
    return {
      success: true,
      accessToken,
      user: {
        id: populatedUser._id.toString(),
        email: populatedUser.email,
        fullName: populatedUser.fullName,
        avatar: populatedUser.avatar,
        roleId: populatedUser.roleId ? (populatedUser.roleId as any)._id.toString() : undefined,
        campusId: populatedUser.campusId, // Return full campus object
        hasFaceId: Boolean(hasFaceTemplate),
        hasFingerId: Boolean(hasFingerTemplate),
      },
      roleDetails,
      permissions,
    };
  }

  /**
   * Login user with email and password.
   */
  async loginWithPassword(dto: LoginWithPasswordDto): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.userModel
      .findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } })
      .select('+passwordHash')
      .populate('campusId', 'campusCode campusName address')
      .populate('roleId', 'roleCode roleLevel roleName canAccessWeb scope description')
      .exec();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account has not set a password yet. Please sign in with Google first.',
      );
    }

    const passwordMatched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatched) {
      throw new UnauthorizedException('Invalid email or password');
    }

    let roleDetails = null;
    let permissions = [];
    let permissionCodes = [];

    if (user.roleId) {
      const role = user.roleId as any;
      roleDetails = {
        id: role._id.toString(),
        roleCode: role.roleCode,
        roleName: role.roleName,
        roleLevel: role.roleLevel,
        scope: role.scope,
        canAccessWeb: role.canAccessWeb || false,
        description: role.description,
      };

      const rolePermissions = await this.rolePermissionModel
        .find({ roleId: role._id })
        .populate('permissionId')
        .exec();

      permissions = rolePermissions
        .filter(rp => rp.permissionId)
        .map(rp => {
          const perm = rp.permissionId as any;
          return {
            id: perm._id.toString(),
            permissionCode: perm.permissionCode,
            permissionName: perm.permissionName,
            resource: perm.resource,
            action: perm.action,
            description: perm.description,
          };
        });

      permissionCodes = permissions.map(p => p.permissionName);
    }

    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      roleCode: roleDetails?.roleCode || 'STUDENT',
      roleLevel: roleDetails?.roleLevel || 4,
      roleScope: roleDetails?.scope || 'SELF',
      campusId: user.campusId?._id?.toString() || null,
      permissions: permissionCodes,
    };

    const accessToken = this.jwtService.sign(payload);
    const hasFaceTemplate = await this.faceTemplateModel.exists({ userId: user._id });
    const hasFingerTemplate = await this.userModel.exists({
      _id: user._id,
      fingerprintData: { $exists: true, $nin: ['', null] },
    });

    return {
      success: true,
      accessToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
        roleId: user.roleId ? (user.roleId as any)._id.toString() : undefined,
        campusId: user.campusId,
        hasFaceId: Boolean(hasFaceTemplate),
        hasFingerId: Boolean(hasFingerTemplate),
      },
      roleDetails,
      permissions,
      hasPassword: true,
    };
  }

  /**
   * Get user profile with role and permissions
   */
  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-faceData -fingerprintData -googleId +passwordHash')
      .populate('campusId', 'campusCode campusName address')
      .populate('roleId')
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hasPassword = Boolean(user.passwordHash);
    const hasFaceTemplate = await this.faceTemplateModel.exists({ userId: user._id });
    const hasFaceId = Boolean(hasFaceTemplate);
    const hasFingerTemplate = await this.userModel.exists({
      _id: user._id,
      fingerprintData: { $exists: true, $nin: ['', null] },
    });
    const hasFingerId = Boolean(hasFingerTemplate);
    const userData = user.toObject();
    delete userData.passwordHash;

    // Get permissions for this role
    let roleDetails = null;
    let permissions = [];

    if (user.roleId) {
      const role = user.roleId as any;
      roleDetails = {
        id: role._id.toString(),
        roleName: role.roleName,
        roleCode: role.roleCode,
        roleLevel: role.roleLevel,
        scope: role.scope,
        canAccessWeb: role.canAccessWeb || false,
        description: role.description,
      };

      // Get role-permission mappings
      const rolePermissions = await this.rolePermissionModel
        .find({ roleId: role._id })
        .populate('permissionId')
        .exec();

      // Extract permission details
      permissions = rolePermissions
        .filter((rp) => rp.permissionId)
        .map((rp) => {
          const perm = rp.permissionId as any;
          return {
            id: perm._id.toString(),
            permissionCode: perm.permissionCode,
            permissionName: perm.permissionName,
            resource: perm.resource,
            action: perm.action,
            description: perm.description,
          };
        });
    }

    return {
      success: true,
      data: userData,
      roleDetails,
      permissions,
      hasPassword,
      hasFaceId,
      hasFingerId,
    };
  }

  /**
   * Set initial password for Google-authenticated users.
   */
  async setPassword(userId: string, dto: SetPasswordDto) {
    const { newPassword, confirmPassword } = dto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.userModel.findById(userId).select('+passwordHash').exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is inactive');
    }

    if (user.passwordHash) {
      throw new BadRequestException('Password already set');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return {
      success: true,
      message: 'Password has been set successfully',
    };
  }

    /**
     * Update current user's own profile fields.
     */
    async updateProfile(userId: string, dto: UpdateProfileDto) {
    const payload: Partial<UpdateProfileDto> = {};

    if (typeof dto.fullName === 'string') {
      const fullName = dto.fullName.trim();
      if (!fullName) {
        throw new BadRequestException('Full name cannot be empty');
      }
      payload.fullName = fullName;
    }

    if (typeof dto.phone === 'string') {
      const phone = dto.phone.trim();
      if (!phone) {
        throw new BadRequestException('Phone cannot be empty');
      }
      payload.phone = phone;
    }

    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const updatedUser = await this.userModel
      .findOneAndUpdate(
        { _id: userId, isActive: true },
        payload,
        { new: true, runValidators: true }
      )
      .select('-faceData -fingerprintData -googleId +passwordHash')
      .populate('campusId', 'campusCode campusName')
      .populate('roleId', 'roleName')
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('User not found or inactive');
    }

    const hasPassword = Boolean(updatedUser.passwordHash);

    const user = updatedUser.toObject();
    delete user.passwordHash;

    return {
      success: true,
      message: 'Profile updated successfully',
      data: user,
      hasPassword,
    };
  }

  /**
   * Create one-time reset token and send reset email.
   * Always returns generic success message to prevent user enumeration.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const genericResponse = {
      success: true,
      message:
        'If this email exists in our system, a password reset link has been sent.',
    };

    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userModel
      .findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } })
      .select('_id email fullName isActive')
      .exec();

    if (!user || !user.isActive) {
      return genericResponse;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Revoke all previous unused tokens for this user.
    await this.resetPasswordTokenModel.updateMany(
      { userId: user._id, used: false },
      { $set: { used: true } },
    );

    await this.resetPasswordTokenModel.create({
      userId: user._id,
      tokenHash,
      expiresAt,
      used: false,
    });

    await this.sendResetPasswordEmail(user.email, user.fullName, rawToken, expiresAt);

    return genericResponse;
  }

  /**
   * Reset password by one-time token.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const { token, newPassword, confirmPassword } = dto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const tokenHash = this.hashResetToken(token);
    const tokenDoc = await this.resetPasswordTokenModel
      .findOne({
        tokenHash,
        used: false,
        expiresAt: { $gt: new Date() },
      })
      .exec();

    if (!tokenDoc) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.userModel
      .findById(tokenDoc.userId)
      .select('+passwordHash')
      .exec();

    if (!user || !user.isActive) {
      tokenDoc.used = true;
      await tokenDoc.save();
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    tokenDoc.used = true;
    await tokenDoc.save();

    return {
      success: true,
      message: 'Password has been reset successfully',
    };
  }

  private hashResetToken(token: string): string {
    const pepper = this.configService.get<string>('RESET_PASSWORD_TOKEN_PEPPER') || '';
    return createHash('sha256')
      .update(`${token}:${pepper}`)
      .digest('hex');
  }

  private async sendResetPasswordEmail(
    email: string,
    fullName: string,
    rawToken: string,
    expiresAt: Date,
  ) {
    const host = this.configService.get<string>('MAIL_HOST');
    const port = Number(this.configService.get<string>('MAIL_PORT') || '587');
    const user = this.configService.get<string>('MAIL_USER');
    const pass = this.configService.get<string>('MAIL_PASSWORD');
    const from =
      this.configService.get<string>('MAIL_FROM') ||
      this.configService.get<string>('MAIL_USER') ||
      'no-reply@example.com';

    if (!host || !user || !pass) {
      this.logger.warn('Missing MAIL_HOST/MAIL_USER/MAIL_PASSWORD. Skip reset password email.');
      return;
    }

    const frontendUrl = (this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001').replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const expiredAtText = expiresAt.toLocaleString('vi-VN', { hour12: false });

    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: 'Password Reset Request',
        text: [
          `Hello ${fullName || 'user'},`,
          '',
          'We received a request to reset your password.',
          `Reset link: ${resetUrl}`,
          `This link expires at: ${expiredAtText}`,
          '',
          'If you did not request this, please ignore this email.',
        ].join('\n'),
        html: `
          <p>Hello ${fullName || 'user'},</p>
          <p>We received a request to reset your password.</p>
          <p><a href="${resetUrl}">Click here to reset your password</a></p>
          <p>This link expires at: <strong>${expiredAtText}</strong></p>
          <p>If you did not request this, please ignore this email.</p>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send reset password email to ${email}: ${error.message}`);
    }
  }

  /**
   * Register or update Face ID template for current user.
   */
  async registerFaceId(userId: string, faceImageBase64: string) {
    const normalizedFaceImage = this.normalizeAndValidateFacePayload(faceImageBase64);
    const analysis = await this.extractFaceAnalysis(normalizedFaceImage);
    const user = await this.getActiveUserOrThrow(userId);
    const registration = await this.upsertFaceTemplate(user, analysis.embedding, 'camera');

    return {
      success: true,
      message: 'Face ID registered successfully',
      data: {
        userId: user._id.toString(),
        hasFaceId: true,
        templateHash: registration.templateHash,
        embeddingVersion: 'embedding-v1',
        duplicateThreshold: registration.duplicateThreshold,
        detectorScore: analysis.detectorScore,
        updatedAt: new Date(),
      },
    };
  }

  /**
   * Verify current user face against registered embedding template.
   */
  async verifyFaceId(userId: string, faceImageBase64: string) {
    const normalizedFaceImage = this.normalizeAndValidateFacePayload(faceImageBase64);
    const analysis = await this.extractFaceAnalysis(normalizedFaceImage);
    const user = await this.getActiveUserOrThrow(userId);
    const verification = await this.verifyEmbeddingForUser(user, analysis.embedding);

    return {
      success: true,
      message: verification.verified ? 'Face verification succeeded' : 'Face verification failed',
      data: {
        userId: user._id.toString(),
        verified: verification.verified,
        similarity: Number(verification.similarity.toFixed(4)),
        threshold: verification.threshold,
        algorithm: verification.algorithm,
        detectorScore: analysis.detectorScore,
      },
    };
  }

  async startFaceScanSession(userId: string) {
    this.cleanupExpiredFaceScanSessions();
    await this.getActiveUserOrThrow(userId);

    const sessionId = randomUUID();
    const now = Date.now();
    const stepRules = this.buildFaceScanStepRules();
    const challengeSteps = stepRules.map((rule) => rule.step);
    const ttlMs = this.getFaceScanSessionTtlMs();
    const minFrames = this.getFaceScanMinFrames();
    const minDurationMs = this.getFaceScanMinDurationMs();

    this.faceScanSessions.set(sessionId, {
      sessionId,
      userId,
      stepRules,
      currentStepIndex: 0,
      currentStepPassFrames: 0,
      currentStepStartedAt: now,
      createdAt: now,
      expiresAt: now + ttlMs,
      frames: [],
      baselineCenterX: null,
      lastTurnDirectionSign: null,
      firstFrameAt: null,
      lastFrameAt: null,
    });

    return {
      success: true,
      message: 'Face scan session started',
      data: {
        sessionId,
        challengeSteps,
        currentChallenge: challengeSteps[0],
        stepRequiredFrames: stepRules[0].requiredFrames,
        stepTimeoutMs: stepRules[0].timeoutMs,
        minFrames,
        minDurationMs,
        expiresAt: new Date(now + ttlMs).toISOString(),
      },
    };
  }

  async submitFaceScanFrame(userId: string, sessionId: string, frameImageBase64: string) {
    this.cleanupExpiredFaceScanSessions();

    const session = this.getFaceScanSessionOrThrow(sessionId, userId);
    const currentStepRule = session.stepRules[session.currentStepIndex];
    if (!currentStepRule) {
      throw new BadRequestException('Face scan challenge already completed');
    }

    const now = Date.now();
    if (now - session.currentStepStartedAt > currentStepRule.timeoutMs) {
      this.faceScanSessions.delete(sessionId);
      throw new BadRequestException('Face scan challenge timed out. Please start again.');
    }

    const normalizedFaceImage = this.normalizeAndValidateFacePayload(frameImageBase64);
    const analysis = await this.extractFaceAnalysis(normalizedFaceImage);
    const minDetectorScore = this.getFaceScanMinDetectorScore();
    const minBboxArea = this.getFaceScanMinBboxArea();
    const maxAbsPitch = this.getFaceScanMaxAbsPitch();
    const maxAbsRoll = this.getFaceScanMaxAbsRoll();

    if (analysis.detectorScore !== null && analysis.detectorScore < minDetectorScore) {
      throw new BadRequestException(
        'Face quality is too low. Keep your face centered and try again.',
      );
    }

    if (analysis.bboxArea !== null && analysis.bboxArea < minBboxArea) {
      throw new BadRequestException('Move closer to camera so your face is large enough in frame.');
    }

    if (analysis.posePitch !== null && Math.abs(analysis.posePitch) > maxAbsPitch) {
      throw new BadRequestException('Keep your face vertical (avoid looking up/down too much).');
    }

    if (analysis.poseRoll !== null && Math.abs(analysis.poseRoll) > maxAbsRoll) {
      throw new BadRequestException('Keep your head straight (avoid tilting).');
    }

    if (session.frames.length >= 20) {
      session.frames.shift();
    }
    session.frames.push(analysis);
    session.expiresAt = now + this.getFaceScanSessionTtlMs();
    session.firstFrameAt = session.firstFrameAt ?? now;
    session.lastFrameAt = now;

    const challengePassed = this.evaluateChallengeStep(session, currentStepRule, analysis);
    if (challengePassed) {
      session.currentStepPassFrames += 1;
    } else {
      session.currentStepPassFrames = 0;
    }

    if (session.currentStepPassFrames >= currentStepRule.requiredFrames) {
      session.currentStepIndex += 1;
      session.currentStepPassFrames = 0;
      session.currentStepStartedAt = now;
    }

    const challengeCompleted = session.currentStepIndex >= session.stepRules.length;
    const framesCollected = session.frames.length;
    const durationMs = this.extractSessionDurationMs(session);
    const nextStepRule = challengeCompleted ? null : session.stepRules[session.currentStepIndex];
    const recommendedNextAction =
      challengeCompleted &&
      framesCollected >= this.getFaceScanMinFrames() &&
      durationMs >= this.getFaceScanMinDurationMs()
        ? 'complete-session'
        : 'submit-more-frames';

    return {
      success: true,
      message: challengePassed ? 'Frame accepted and challenge step passed' : 'Frame accepted',
      data: {
        sessionId: session.sessionId,
        challengePassed,
        currentChallenge: challengeCompleted ? null : (nextStepRule?.step ?? null),
        completedChallenges: session.currentStepIndex,
        totalChallenges: session.stepRules.length,
        challengeCompleted,
        framesCollected,
        stepPassFrames: challengeCompleted ? 0 : session.currentStepPassFrames,
        stepRequiredFrames: challengeCompleted ? 0 : (nextStepRule?.requiredFrames ?? 0),
        remainingStepMs: challengeCompleted
          ? 0
          : Math.max(
              0,
              (nextStepRule?.timeoutMs ?? 0) - (Date.now() - session.currentStepStartedAt),
            ),
        durationMs,
        detectorScore: analysis.detectorScore,
        poseYaw: analysis.poseYaw,
        recommendedNextAction,
      },
    };
  }

  async completeFaceScanSession(userId: string, sessionId: string) {
    this.cleanupExpiredFaceScanSessions();

    const session = this.getFaceScanSessionOrThrow(sessionId, userId);
    const challengeCompleted = session.currentStepIndex >= session.stepRules.length;
    if (!challengeCompleted) {
      throw new BadRequestException('Face scan challenge is not completed yet');
    }

    const minFrames = this.getFaceScanMinFrames();
    if (session.frames.length < minFrames) {
      throw new BadRequestException(`Face scan requires at least ${minFrames} valid frames`);
    }

    const scanDurationMs = this.extractSessionDurationMs(session);
    const minDurationMs = this.getFaceScanMinDurationMs();
    if (scanDurationMs < minDurationMs) {
      throw new BadRequestException(
        `Face scan duration is too short. Please scan for at least ${minDurationMs}ms.`,
      );
    }

    const aggregatedEmbedding = this.aggregateEmbeddings(
      session.frames.map((frame) => frame.embedding),
    );
    const livenessMetrics = this.computeLivenessMetrics(
      session.frames,
      challengeCompleted,
      scanDurationMs,
    );
    const livenessThreshold = this.getFaceScanLivenessThreshold();
    const livenessPassed = livenessMetrics.score >= livenessThreshold;
    const user = await this.getActiveUserOrThrow(userId);

    this.faceScanSessions.delete(sessionId);

    if (!livenessPassed) {
      return {
        success: true,
        message: 'Face scan failed liveness checks',
        data: {
          userId: user._id.toString(),
          livenessPassed: false,
          livenessScore: Number(livenessMetrics.score.toFixed(4)),
          livenessThreshold,
          challengeCompleted,
          durationMs: livenessMetrics.durationMs,
        },
      };
    }

    const registration = await this.upsertFaceTemplate(user, aggregatedEmbedding, 'face-scan-v1.1');

    return {
      success: true,
      message: 'Face scan registration completed',
      data: {
        userId: user._id.toString(),
        hasFaceId: true,
        templateHash: registration.templateHash,
        duplicateThreshold: registration.duplicateThreshold,
        livenessPassed: true,
        livenessScore: Number(livenessMetrics.score.toFixed(4)),
        livenessThreshold,
        metrics: {
          detectorAverage: Number(livenessMetrics.detectorAverage.toFixed(4)),
          embeddingDiversity: Number(livenessMetrics.embeddingDiversity.toFixed(4)),
          yawRange: Number(livenessMetrics.yawRange.toFixed(4)),
          centerXRange: Number(livenessMetrics.centerXRange.toFixed(4)),
          bboxAreaAverage: Number(livenessMetrics.bboxAreaAverage.toFixed(4)),
          durationMs: livenessMetrics.durationMs,
        },
      },
    };
  }

  private cleanupExpiredFaceScanSessions() {
    const now = Date.now();

    for (const [sessionId, session] of this.faceScanSessions.entries()) {
      if (session.expiresAt <= now) {
        this.faceScanSessions.delete(sessionId);
      }
    }
  }

  private buildFaceScanStepRules(): FaceScanStepRule[] {
    const firstTurn: FaceScanChallengeStep = Math.random() < 0.5 ? 'turn-left' : 'turn-right';
    const secondTurn: FaceScanChallengeStep =
      firstTurn === 'turn-left' ? 'turn-right' : 'turn-left';
    const stepTimeoutMs = this.getFaceScanStepTimeoutMs();

    return [
      { step: 'center', requiredFrames: 1, timeoutMs: stepTimeoutMs },
      { step: firstTurn, requiredFrames: 1, timeoutMs: stepTimeoutMs },
      { step: secondTurn, requiredFrames: 1, timeoutMs: stepTimeoutMs },
      { step: 'center-hold', requiredFrames: 1, timeoutMs: stepTimeoutMs },
    ];
  }

  private getFaceScanSessionOrThrow(sessionId: string, userId: string): FaceScanSession {
    const session = this.faceScanSessions.get(sessionId);
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Face scan session not found or expired');
    }

    if (session.expiresAt <= Date.now()) {
      this.faceScanSessions.delete(sessionId);
      throw new NotFoundException('Face scan session has expired');
    }

    return session;
  }

  private evaluateChallengeStep(
    session: FaceScanSession,
    stepRule: FaceScanStepRule,
    analysis: FaceAnalysis,
  ): boolean {
    if (stepRule.step === 'center' || stepRule.step === 'center-hold') {
      if (analysis.poseYaw !== null) {
        const pass = Math.abs(analysis.poseYaw) <= 10;
        if (pass && analysis.bboxCenterX !== null && session.baselineCenterX === null) {
          session.baselineCenterX = analysis.bboxCenterX;
        }
        return pass;
      }

      // If provider does not expose pose, accept center challenge.
      if (analysis.bboxCenterX !== null && session.baselineCenterX === null) {
        session.baselineCenterX = analysis.bboxCenterX;
      }
      return true;
    }

    if (analysis.poseYaw !== null) {
      if (stepRule.step === 'turn-left' || stepRule.step === 'turn-right') {
        return this.evaluateDirectionalTurn(
          session,
          analysis.poseYaw,
          DEFAULT_FACE_SCAN_TURN_YAW_THRESHOLD,
        );
      }

      return Math.abs(analysis.poseYaw) <= 10;
    }

    if (session.baselineCenterX !== null && analysis.bboxCenterX !== null) {
      const offset = analysis.bboxCenterX - session.baselineCenterX;
      if (stepRule.step === 'turn-left' || stepRule.step === 'turn-right') {
        return this.evaluateDirectionalTurn(
          session,
          offset,
          DEFAULT_FACE_SCAN_TURN_OFFSET_THRESHOLD,
        );
      }

      return Math.abs(offset) <= 10;
    }

    // Final fallback: if no pose/bbox metadata exists, require some embedding drift.
    const centerFrame = session.frames.find(
      (frame) => frame.embedding.length === analysis.embedding.length,
    );
    if (!centerFrame) {
      return false;
    }

    const similarity = this.calculateCosineSimilarity(centerFrame.embedding, analysis.embedding);
    if (stepRule.step === 'turn-left' || stepRule.step === 'turn-right') {
      return similarity <= 0.99;
    }

    return similarity >= 0.985;
  }

  private evaluateDirectionalTurn(
    session: FaceScanSession,
    directionalSignal: number,
    minMagnitude: number,
  ): boolean {
    if (!Number.isFinite(directionalSignal) || Math.abs(directionalSignal) < minMagnitude) {
      return false;
    }

    const directionSign: -1 | 1 = directionalSignal >= 0 ? 1 : -1;
    if (session.lastTurnDirectionSign === null) {
      session.lastTurnDirectionSign = directionSign;
      return true;
    }

    if (session.lastTurnDirectionSign === directionSign) {
      return false;
    }

    session.lastTurnDirectionSign = directionSign;
    return true;
  }

  private computeLivenessMetrics(
    frames: FaceAnalysis[],
    challengeCompleted: boolean,
    durationMs: number,
  ): FaceScanLivenessMetrics {
    const detectorScores = frames
      .map((frame) => frame.detectorScore)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const detectorAverage = detectorScores.length
      ? detectorScores.reduce((sum, value) => sum + value, 0) / detectorScores.length
      : 0;

    let diversityAccumulator = 0;
    let diversityCount = 0;
    for (let idx = 1; idx < frames.length; idx += 1) {
      const similarity = this.calculateCosineSimilarity(
        frames[idx - 1].embedding,
        frames[idx].embedding,
      );
      diversityAccumulator += Math.max(0, 1 - similarity);
      diversityCount += 1;
    }
    const embeddingDiversity = diversityCount > 0 ? diversityAccumulator / diversityCount : 0;

    const yawValues = frames
      .map((frame) => frame.poseYaw)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const yawRange = yawValues.length > 0 ? Math.max(...yawValues) - Math.min(...yawValues) : 0;

    const centerXValues = frames
      .map((frame) => frame.bboxCenterX)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const centerXRange =
      centerXValues.length > 0 ? Math.max(...centerXValues) - Math.min(...centerXValues) : 0;

    const bboxAreas = frames
      .map((frame) => frame.bboxArea)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const bboxAreaAverage =
      bboxAreas.length > 0
        ? bboxAreas.reduce((sum, value) => sum + value, 0) / bboxAreas.length
        : 0;

    const yawScore = Math.max(0, Math.min(1, yawRange / 35));
    const centerShiftScore = Math.max(0, Math.min(1, centerXRange / 55));
    const movementScore = Math.max(yawScore, centerShiftScore);
    const diversityScore = Math.max(0, Math.min(1, embeddingDiversity / 0.12));
    const qualityScore = Math.max(0, Math.min(1, (detectorAverage - 0.45) / 0.5));
    const bboxScore = Math.max(
      0,
      Math.min(1, bboxAreaAverage / (this.getFaceScanMinBboxArea() * 1.5)),
    );
    const challengeScore = challengeCompleted ? 1 : 0;
    const durationScore = Math.max(0, Math.min(1, durationMs / this.getFaceScanMinDurationMs()));
    const score =
      0.35 * challengeScore +
      0.2 * movementScore +
      0.15 * diversityScore +
      0.15 * qualityScore +
      0.1 * bboxScore +
      0.05 * durationScore;

    return {
      score,
      detectorAverage,
      embeddingDiversity,
      yawRange,
      centerXRange,
      bboxAreaAverage,
      durationMs,
      challengeCompleted,
    };
  }

  private extractSessionDurationMs(session: FaceScanSession): number {
    if (session.firstFrameAt === null || session.lastFrameAt === null) {
      return 0;
    }

    return Math.max(0, session.lastFrameAt - session.firstFrameAt);
  }

  private aggregateEmbeddings(embeddings: number[][]): number[] {
    if (!embeddings.length) {
      throw new BadRequestException('No face embeddings were captured');
    }

    const dimension = embeddings[0].length;
    const dimensionMismatch = embeddings.some((vector) => vector.length !== dimension);
    if (dimensionMismatch) {
      throw new BadRequestException('Embedding dimension mismatch in scan session');
    }

    const merged = new Array<number>(dimension).fill(0);
    for (const vector of embeddings) {
      for (let idx = 0; idx < dimension; idx += 1) {
        merged[idx] += vector[idx];
      }
    }

    const averaged = merged.map((value) => value / embeddings.length);
    return this.normalizeEmbedding(averaged);
  }

  private async getActiveUserOrThrow(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is inactive');
    }

    return user;
  }

  private async upsertFaceTemplate(user: User, embedding: number[], source: string) {
    const templateHash = createHash('sha256').update(JSON.stringify(embedding)).digest('hex');
    const duplicateThreshold = this.getRegisterDuplicateThreshold();

    const existingTemplates = await this.faceTemplateModel
      .find({ userId: { $ne: user._id }, embedding: { $exists: true, $ne: [] } })
      .select('embedding')
      .lean()
      .exec();

    const duplicatedTemplate = existingTemplates.find((template) => {
      if (!Array.isArray(template.embedding) || template.embedding.length !== embedding.length) {
        return false;
      }

      const similarity = this.calculateCosineSimilarity(embedding, template.embedding as number[]);
      return similarity >= duplicateThreshold;
    });

    if (duplicatedTemplate) {
      throw new ConflictException('Face ID is too similar to another registered user');
    }

    await this.faceTemplateModel.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        templateHash,
        embedding,
        embeddingNorm: 1,
        algorithm: 'embedding-v1',
        source,
        qualityScore: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Remove legacy raw face payload after migrating to face_templates collection.
    await this.userModel.updateOne({ _id: user._id }, { $unset: { faceData: 1 } }).exec();

    return {
      templateHash,
      duplicateThreshold,
    };
  }

  private async verifyEmbeddingForUser(user: User, candidateEmbedding: number[]) {
    const verifyThreshold = this.getVerifySimilarityThreshold();

    const registeredTemplate = await this.faceTemplateModel
      .findOne({ userId: user._id })
      .select('embedding algorithm')
      .lean()
      .exec();

    if (!registeredTemplate?.embedding?.length) {
      throw new NotFoundException('Face template is not registered for this account');
    }

    const storedEmbedding = registeredTemplate.embedding as number[];
    if (storedEmbedding.length !== candidateEmbedding.length) {
      throw new BadRequestException(
        'Face template version mismatch. Please register Face ID again.',
      );
    }

    const similarity = this.calculateCosineSimilarity(candidateEmbedding, storedEmbedding);
    const verified = similarity >= verifyThreshold;

    return {
      verified,
      similarity,
      threshold: verifyThreshold,
      algorithm: registeredTemplate.algorithm || 'embedding-v1',
    };
  }

  private normalizeAndValidateFacePayload(faceImageBase64: string): string {
    const normalizedFaceImage = faceImageBase64
      .trim()
      .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');

    const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    if (!base64Pattern.test(normalizedFaceImage)) {
      throw new BadRequestException('Invalid face image payload');
    }

    const payloadSize = Buffer.byteLength(normalizedFaceImage, 'utf8');
    if (payloadSize < 1000) {
      throw new BadRequestException('Face image payload is too small');
    }

    if (payloadSize > 4_000_000) {
      throw new BadRequestException('Face image payload is too large');
    }

    return normalizedFaceImage;
  }

  private async extractFaceEmbedding(faceImageBase64: string): Promise<number[]> {
    const analysis = await this.extractFaceAnalysis(faceImageBase64);
    return analysis.embedding;
  }

  private async extractFaceAnalysis(faceImageBase64: string): Promise<FaceAnalysis> {
    const providerAnalysis = await this.extractFaceAnalysisFromProvider(faceImageBase64);
    if (providerAnalysis) {
      return providerAnalysis;
    }

    const allowFallback =
      (process.env.FACE_EMBEDDING_ALLOW_DEV_FALLBACK || 'true').toLowerCase() === 'true';
    if (!allowFallback) {
      throw new BadRequestException('Face embedding provider is not configured');
    }

    return {
      embedding: this.buildDeterministicDevEmbedding(faceImageBase64),
      detectorScore: null,
      poseYaw: null,
      posePitch: null,
      poseRoll: null,
      bboxCenterX: null,
      bboxArea: null,
    };
  }

  private async extractFaceAnalysisFromProvider(
    faceImageBase64: string,
  ): Promise<FaceAnalysis | null> {
    const providerUrl = (process.env.FACE_EMBEDDING_PROVIDER_URL || '').trim();
    if (!providerUrl) {
      return null;
    }

    const providerApiKey = (process.env.FACE_EMBEDDING_PROVIDER_API_KEY || '').trim();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (providerApiKey) {
      headers.Authorization = `Bearer ${providerApiKey}`;
    }

    const providerTimeoutMs = this.getProviderTimeoutMs();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), providerTimeoutMs);

    let response: Response;
    try {
      response = await fetch(providerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageBase64: faceImageBase64,
          inputFormat: 'base64',
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadRequestException(
          `Face embedding provider timed out after ${providerTimeoutMs}ms`,
        );
      }

      throw new BadRequestException('Face embedding provider is unreachable');
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      throw new BadRequestException(`Face embedding provider returned ${response.status}`);
    }

    const payload = (await response.json()) as EmbeddingProviderResponse;
    return this.extractFaceAnalysisFromProviderPayload(payload);
  }

  private extractFaceAnalysisFromProviderPayload(payload: EmbeddingProviderResponse): FaceAnalysis {
    const rootFaces = payload.faces;
    const resultFaces = payload.result?.faces;
    const dataFaces = payload.data?.faces;
    const rootFace = Array.isArray(rootFaces) ? rootFaces[0] : undefined;
    const resultFace = Array.isArray(resultFaces) ? resultFaces[0] : undefined;
    const dataFace = Array.isArray(dataFaces) ? dataFaces[0] : undefined;

    const candidates: unknown[] = [
      payload.embedding,
      payload.result?.embedding,
      payload.data?.embedding,
      payload.data?.face?.embedding,
      payload.data?.face?.normedEmbedding,
      payload.data?.face?.normed_embedding,
      Array.isArray(rootFaces) ? rootFaces[0]?.embedding : undefined,
      Array.isArray(rootFaces) ? rootFaces[0]?.normedEmbedding : undefined,
      Array.isArray(rootFaces) ? rootFaces[0]?.normed_embedding : undefined,
      Array.isArray(resultFaces) ? resultFaces[0]?.embedding : undefined,
      Array.isArray(resultFaces) ? resultFaces[0]?.normedEmbedding : undefined,
      Array.isArray(resultFaces) ? resultFaces[0]?.normed_embedding : undefined,
      Array.isArray(dataFaces) ? dataFaces[0]?.embedding : undefined,
      Array.isArray(dataFaces) ? dataFaces[0]?.normedEmbedding : undefined,
      Array.isArray(dataFaces) ? dataFaces[0]?.normed_embedding : undefined,
    ];

    let embedding: number[] | null = null;

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      const parsedEmbedding = candidate.map((value) => Number(value));
      const isAllFinite = parsedEmbedding.every((value) => Number.isFinite(value));
      if (parsedEmbedding.length > 0 && isAllFinite) {
        embedding = parsedEmbedding;
        break;
      }
    }

    if (!embedding) {
      throw new BadRequestException('Face embedding provider returned invalid embedding');
    }

    const normalizedEmbedding = this.normalizeEmbedding(embedding);

    const detectorScore = this.pickNumericValue([
      payload.data?.detectorScore,
      payload.data?.face?.detectorScore,
      rootFace?.detectorScore,
      rootFace?.det_score,
      resultFace?.detectorScore,
      resultFace?.det_score,
      dataFace?.detectorScore,
      dataFace?.det_score,
    ]);

    const bboxCenterX = this.pickNumericValue([
      payload.data?.bboxCenterX,
      payload.data?.face?.bboxCenterX,
      rootFace?.bboxCenterX,
      resultFace?.bboxCenterX,
      dataFace?.bboxCenterX,
      this.extractBboxCenterX(rootFace?.bbox),
      this.extractBboxCenterX(resultFace?.bbox),
      this.extractBboxCenterX(dataFace?.bbox),
    ]);

    const bboxArea = this.pickNumericValue([
      payload.data?.bboxArea,
      payload.data?.face?.bboxArea,
      rootFace?.bboxArea,
      resultFace?.bboxArea,
      dataFace?.bboxArea,
      this.extractBboxArea(rootFace?.bbox),
      this.extractBboxArea(resultFace?.bbox),
      this.extractBboxArea(dataFace?.bbox),
    ]);

    const rawPose =
      rootFace?.pose ??
      resultFace?.pose ??
      dataFace?.pose ??
      payload.data?.face?.pose ??
      payload.data?.facePose ??
      payload.data?.face_pose ??
      null;

    const poseYaw = this.pickNumericValue([
      payload.data?.poseYaw,
      payload.data?.face?.poseYaw,
      rootFace?.poseYaw,
      resultFace?.poseYaw,
      dataFace?.poseYaw,
      this.extractPoseValue(rawPose, 1),
    ]);

    const posePitch = this.pickNumericValue([
      payload.data?.posePitch,
      payload.data?.face?.posePitch,
      rootFace?.posePitch,
      resultFace?.posePitch,
      dataFace?.posePitch,
      this.extractPoseValue(rawPose, 0),
    ]);

    const poseRoll = this.pickNumericValue([
      payload.data?.poseRoll,
      payload.data?.face?.poseRoll,
      rootFace?.poseRoll,
      resultFace?.poseRoll,
      dataFace?.poseRoll,
      this.extractPoseValue(rawPose, 2),
    ]);

    return {
      embedding: normalizedEmbedding,
      detectorScore,
      poseYaw,
      posePitch,
      poseRoll,
      bboxCenterX,
      bboxArea,
    };
  }

  private pickNumericValue(candidates: unknown[]): number | null {
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return null;
  }

  private extractPoseValue(rawPose: unknown, axisIndex: number): number | null {
    if (!Array.isArray(rawPose) || rawPose.length <= axisIndex) {
      return null;
    }

    const parsed = Number(rawPose[axisIndex]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private extractBboxCenterX(rawBbox: unknown): number | null {
    if (!Array.isArray(rawBbox) || rawBbox.length < 4) {
      return null;
    }

    const x1 = Number(rawBbox[0]);
    const x2 = Number(rawBbox[2]);
    if (!Number.isFinite(x1) || !Number.isFinite(x2)) {
      return null;
    }

    return (x1 + x2) / 2;
  }

  private extractBboxArea(rawBbox: unknown): number | null {
    if (!Array.isArray(rawBbox) || rawBbox.length < 4) {
      return null;
    }

    const x1 = Number(rawBbox[0]);
    const y1 = Number(rawBbox[1]);
    const x2 = Number(rawBbox[2]);
    const y2 = Number(rawBbox[3]);
    if (
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(x2) ||
      !Number.isFinite(y2)
    ) {
      return null;
    }

    const width = Math.max(0, x2 - x1);
    const height = Math.max(0, y2 - y1);
    return width * height;
  }

  private buildDeterministicDevEmbedding(faceImageBase64: string): number[] {
    const embedding: number[] = [];

    for (let i = 0; i < DEV_EMBEDDING_DIMENSION; i += 1) {
      const digest = createHash('sha256').update(`${faceImageBase64}:${i}`).digest();
      const intValue = digest.readInt32BE(0);
      embedding.push(intValue / 2_147_483_647);
    }

    return this.normalizeEmbedding(embedding);
  }

  private normalizeEmbedding(embedding: number[]): number[] {
    if (!embedding.length) {
      throw new BadRequestException('Embedding vector is empty');
    }

    const valid = embedding.every((value) => Number.isFinite(value));
    if (!valid) {
      throw new BadRequestException('Embedding vector contains invalid values');
    }

    const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(norm) || norm <= 0) {
      throw new BadRequestException('Embedding vector norm is invalid');
    }

    return embedding.map((value) => value / norm);
  }

  private calculateCosineSimilarity(lhs: number[], rhs: number[]): number {
    if (lhs.length !== rhs.length) {
      throw new BadRequestException('Embedding dimension mismatch');
    }

    return lhs.reduce((sum, value, index) => sum + value * rhs[index], 0);
  }

  private getVerifySimilarityThreshold(): number {
    return this.parseThreshold(
      process.env.FACE_VERIFY_SIMILARITY_THRESHOLD,
      DEFAULT_VERIFY_SIMILARITY_THRESHOLD,
    );
  }

  private getRegisterDuplicateThreshold(): number {
    return this.parseThreshold(
      process.env.FACE_REGISTER_DUPLICATE_SIMILARITY_THRESHOLD,
      DEFAULT_REGISTER_DUPLICATE_THRESHOLD,
    );
  }

  private getProviderTimeoutMs(): number {
    const rawTimeout = process.env.FACE_EMBEDDING_PROVIDER_TIMEOUT_MS;
    if (!rawTimeout) {
      return DEFAULT_PROVIDER_TIMEOUT_MS;
    }

    const parsed = Number(rawTimeout);
    if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 60000) {
      return DEFAULT_PROVIDER_TIMEOUT_MS;
    }

    return Math.round(parsed);
  }

  private getFaceScanSessionTtlMs(): number {
    const rawValue = process.env.FACE_SCAN_SESSION_TTL_MS;
    if (!rawValue) {
      return DEFAULT_FACE_SCAN_SESSION_TTL_MS;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 30_000 || parsed > 10 * 60_000) {
      return DEFAULT_FACE_SCAN_SESSION_TTL_MS;
    }

    return Math.round(parsed);
  }

  private getFaceScanMinFrames(): number {
    const rawValue = process.env.FACE_SCAN_MIN_FRAMES;
    if (!rawValue) {
      return DEFAULT_FACE_SCAN_MIN_FRAMES;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 3 || parsed > 20) {
      return DEFAULT_FACE_SCAN_MIN_FRAMES;
    }

    return Math.round(parsed);
  }

  private getFaceScanMinDurationMs(): number {
    const rawValue = process.env.FACE_SCAN_MIN_DURATION_MS;
    if (!rawValue) {
      return DEFAULT_FACE_SCAN_MIN_DURATION_MS;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 30_000) {
      return DEFAULT_FACE_SCAN_MIN_DURATION_MS;
    }

    return Math.round(parsed);
  }

  private getFaceScanStepTimeoutMs(): number {
    const rawValue = process.env.FACE_SCAN_STEP_TIMEOUT_MS;
    if (!rawValue) {
      return DEFAULT_FACE_SCAN_STEP_TIMEOUT_MS;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 3000 || parsed > 30_000) {
      return DEFAULT_FACE_SCAN_STEP_TIMEOUT_MS;
    }

    return Math.round(parsed);
  }

  private getFaceScanMinDetectorScore(): number {
    return this.parseThreshold(
      process.env.FACE_SCAN_MIN_DETECTOR_SCORE,
      DEFAULT_FACE_SCAN_MIN_DETECTOR_SCORE,
    );
  }

  private getFaceScanMinBboxArea(): number {
    const rawValue = process.env.FACE_SCAN_MIN_BBOX_AREA;
    if (!rawValue) {
      return DEFAULT_FACE_SCAN_MIN_BBOX_AREA;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 1_000_000) {
      return DEFAULT_FACE_SCAN_MIN_BBOX_AREA;
    }

    return parsed;
  }

  private getFaceScanMaxAbsPitch(): number {
    const rawValue = process.env.FACE_SCAN_MAX_ABS_PITCH;
    if (!rawValue) {
      return DEFAULT_FACE_SCAN_MAX_ABS_PITCH;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 5 || parsed > 60) {
      return DEFAULT_FACE_SCAN_MAX_ABS_PITCH;
    }

    return parsed;
  }

  private getFaceScanMaxAbsRoll(): number {
    const rawValue = process.env.FACE_SCAN_MAX_ABS_ROLL;
    if (!rawValue) {
      return DEFAULT_FACE_SCAN_MAX_ABS_ROLL;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 5 || parsed > 60) {
      return DEFAULT_FACE_SCAN_MAX_ABS_ROLL;
    }

    return parsed;
  }

  private getFaceScanLivenessThreshold(): number {
    return this.parseThreshold(
      process.env.FACE_SCAN_LIVENESS_THRESHOLD,
      DEFAULT_FACE_SCAN_LIVENESS_THRESHOLD,
    );
  }

  private parseThreshold(rawValue: string | undefined, fallback: number): number {
    if (!rawValue) {
      return fallback;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      return fallback;
    }

    return parsed;
  }

  /**
   * Logout (invalidate token - can be implemented with Redis)
   */
  async logout(userId: string) {
    // TODO: Implement token blacklist with Redis
    // For now, just return success (client will remove token)
    return {
      success: true,
      message: 'Logged out successfully',
    };
  }
}
