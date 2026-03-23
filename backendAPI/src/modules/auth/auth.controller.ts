import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@/database/schemas/user.schema';
import { SetPasswordDto } from './dto/set-password.dto';
import { RegisterFaceIdDto } from './dto/register-face-id.dto';
import { VerifyFaceIdDto } from './dto/verify-face-id.dto';
import { StartFaceScanSessionDto } from './dto/start-face-scan-session.dto';
import { SubmitFaceScanFrameDto } from './dto/submit-face-scan-frame.dto';
import { CompleteFaceScanSessionDto } from './dto/complete-face-scan-session.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { LoginWithPasswordDto } from './dto/login-with-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) { }

  /**
   * POST /api/auth/login
   * Login with email and password
   */
  @Post('login')
  async loginWithPassword(@Body() dto: LoginWithPasswordDto) {
    return this.authService.loginWithPassword(dto);
  }

  /**
   * GET /api/auth/google/login?campusId=xxx
   * Initiate Google OAuth login with campus selection
   */
  @Get('google/login')
  @UseGuards(GoogleAuthGuard)
  async googleLogin(
    @Query('campusId') campusId: string,
    @Req() req: any,
  ): Promise<void> {
    // Guard will redirect to Google
    // campusId will be passed as 'state' parameter in GoogleStrategy
  }

  /**
   * GET /api/auth/google/callback
   * Google OAuth callback handler
   */
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any, @Res() res: Response) {
    try {


      const { user } = req;

      // Validate and login user
      const result = await this.authService.validateGoogleUser(
        user,
        user.campusId,
      );

      const frontendUrl = this.configService.get<string>('FRONTEND_URL');
      const mobileAppUrl = this.configService.get<string>('MOBILE_APP_URL') || 'smartlockermobile://auth/callback';
      const isMobileClient = user.client === 'mobile';
      const hasValidMobileRedirectUri =
        typeof user.redirectUri === 'string' &&
        (user.redirectUri.startsWith('exp://') ||
          user.redirectUri.startsWith('smartlockermobile://') ||
          user.redirectUri.startsWith('https://'));
      const mobileRedirectBase = hasValidMobileRedirectUri ? user.redirectUri : mobileAppUrl;

      const redirectBase = isMobileClient ? mobileRedirectBase : `${frontendUrl}/auth/callback`;
      const separator = redirectBase.includes('?') ? '&' : '?';

      if (!isMobileClient) {
        const redirectUrl = `${redirectBase}${separator}token=${result.accessToken}`;
        return res.redirect(redirectUrl);
      }

      // Mobile can still receive user payload, but keep it compact
      const responseData = {
        user: result.user,
        roleDetails: result.roleDetails,
        permissions: (result.permissions || []).map((permission: any) => ({
          permissionName: permission.permissionName,
          resource: permission.resource,
          action: permission.action,
        })),
      };

      const redirectUrl = `${redirectBase}${separator}token=${result.accessToken}&user=${encodeURIComponent(JSON.stringify(responseData))}`;
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ Auth error:', error.message);

      // Redirect to frontend with error
      const frontendUrl = this.configService.get<string>('FRONTEND_URL');
      const mobileAppUrl = this.configService.get<string>('MOBILE_APP_URL') || 'smartlockermobile://auth/callback';
      const isMobileClient = req.user?.client === 'mobile';
      const hasValidMobileRedirectUri =
        typeof req.user?.redirectUri === 'string' &&
        (req.user.redirectUri.startsWith('exp://') ||
          req.user.redirectUri.startsWith('smartlockermobile://') ||
          req.user.redirectUri.startsWith('https://'));
      const mobileRedirectBase = hasValidMobileRedirectUri ? req.user.redirectUri : mobileAppUrl;
      const errorBase = isMobileClient ? mobileRedirectBase : `${frontendUrl}/login`;
      const separator = errorBase.includes('?') ? '&' : '?';
      const errorUrl = `${errorBase}${separator}error=${encodeURIComponent(error.message)}`;

      console.log('🔄 Redirecting to error page:', errorUrl);
      return res.redirect(errorUrl);
    }
  }

  /**
   * GET /api/auth/profile
   * Get current user profile (protected route)
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: User) {
    return this.authService.getProfile(user._id.toString());
  }

  /**
   * PUT /api/auth/profile
   * Update current user profile
   */
  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user._id.toString(), dto);
  }

  /**
   * POST /api/auth/logout
   * Logout current user
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: User) {
    return this.authService.logout(user._id.toString());
  }

  /**
   * POST /api/auth/set-password
   * Set password for the current authenticated user
   */
  @Post('set-password')
  @UseGuards(JwtAuthGuard)
  async setPassword(
    @CurrentUser() user: User,
    @Body() dto: SetPasswordDto,
  ) {
    return this.authService.setPassword(user._id.toString(), dto);
  }

  /**
   * POST /api/auth/forgot-password
   * Always returns generic success message to prevent email enumeration.
   */
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * POST /api/auth/reset-password
   * Reset password by one-time token from email link.
   */
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /**
   * POST /api/auth/register-face-id
   * Register or update Face ID template for the current user.
   */
  @Post('register-face-id')
  @UseGuards(JwtAuthGuard)
  async registerFaceId(
    @CurrentUser() user: User,
    @Body() dto: RegisterFaceIdDto,
  ) {
    return this.authService.registerFaceId(user._id.toString(), dto.faceImageBase64);
  }

  /**
   * POST /api/auth/verify-face-id
   * Verify face against the current user's registered embedding template.
   */
  @Post('verify-face-id')
  @UseGuards(JwtAuthGuard)
  async verifyFaceId(
    @CurrentUser() user: User,
    @Body() dto: VerifyFaceIdDto,
  ) {
    return this.authService.verifyFaceId(user._id.toString(), dto.faceImageBase64);
  }

  /**
   * POST /api/auth/face-scan/register/session-start
   * Start a registration-only face scan session (V1.1).
   */
  @Post('face-scan/register/session-start')
  @UseGuards(JwtAuthGuard)
  async startFaceScanSession(
    @CurrentUser() user: User,
    @Body() _dto: StartFaceScanSessionDto,
  ) {
    return this.authService.startFaceScanSession(user._id.toString());
  }

  /**
   * POST /api/auth/face-scan/register/frame
   * Submit one frame during active registration scan.
   */
  @Post('face-scan/register/frame')
  @UseGuards(JwtAuthGuard)
  async submitFaceScanFrame(
    @CurrentUser() user: User,
    @Body() dto: SubmitFaceScanFrameDto,
  ) {
    return this.authService.submitFaceScanFrame(
      user._id.toString(),
      dto.sessionId,
      dto.frameImageBase64,
    );
  }

  /**
   * POST /api/auth/face-scan/register/complete
   * Complete registration scan session and store template.
   */
  @Post('face-scan/register/complete')
  @UseGuards(JwtAuthGuard)
  async completeFaceScanSession(
    @CurrentUser() user: User,
    @Body() dto: CompleteFaceScanSessionDto,
  ) {
    return this.authService.completeFaceScanSession(user._id.toString(), dto.sessionId);
  }

  /**
   * GET /api/auth/check
   * Check if user is authenticated
   */
  @Get('check')
  @UseGuards(JwtAuthGuard)
  async checkAuth(@CurrentUser() user: User) {
    return {
      success: true,
      authenticated: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        roleId: user.roleId,
      },
    };
  }
}
