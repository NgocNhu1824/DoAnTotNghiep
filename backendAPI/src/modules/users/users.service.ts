import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '@/database/schemas/user.schema';
import { Role } from '@/database/schemas/role.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilterUserDto } from './dto/filter-user.dto';
import { AppConfig } from '@/config/app.config';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    @InjectModel(Role.name)
    private roleModel: Model<Role>,
  ) {}

  /**
   * Create new user (admin creates user before they login)
   */
  async create(createUserDto: CreateUserDto, currentUser?: any): Promise<User> {
    const { email, campusId, roleId } = createUserDto;

    // Check if email already exists
    const existingUser = await this.userModel
      .findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } })
      .exec();

    if (existingUser) {
      throw new ConflictException('Email already exists in the system');
    }

    // Auto-inject campusId if not provided (Phase 1: Use default campus)
    let finalCampusId = campusId;
    if (!finalCampusId) {
      // If Super Admin creates user, use default campus (Phase 1)
      // If Campus Admin creates user, use their campus
      finalCampusId = currentUser?.campusId || AppConfig.DEFAULT_CAMPUS_ID;
    }

    // Validate roleId
    if (!Types.ObjectId.isValid(roleId)) {
      throw new BadRequestException('Invalid role ID');
    }

    const roleExists = await this.roleModel.exists({ _id: roleId });
    if (!roleExists) {
      throw new BadRequestException('Role does not exist');
    }

    // Validate campusId
    if (!Types.ObjectId.isValid(finalCampusId)) {
      throw new BadRequestException('Invalid campus ID');
    }

    // Create user with empty googleId (will be filled when they login)
    const newUser = new this.userModel({
      ...createUserDto,
      googleId: null, // Empty googleId - will be set on first login
      isActive: true,
      roleId: new Types.ObjectId(roleId),
      campusId: new Types.ObjectId(finalCampusId),
    });

    return newUser.save();
  }

  /**
   * Get all users with optional filters (campus-scoped)
   */
  async findAll(filterDto?: FilterUserDto): Promise<User[]> {
    const query: any = {};

    // Apply campus filter (injected by CampusScopeGuard)
    if (filterDto?.campusId) {
      query.campusId = new Types.ObjectId(filterDto.campusId);
    }

    if (filterDto?.roleId) {
      query.roleId = new Types.ObjectId(filterDto.roleId);
    }

    if (filterDto?.campusId) {
      if (!Types.ObjectId.isValid(filterDto.campusId)) {
        throw new BadRequestException('Invalid campus ID');
      }
      query.campusId = new Types.ObjectId(filterDto.campusId);
    }

    if (filterDto?.isActive !== undefined) {
      query.isActive = filterDto.isActive;
    }

    if (filterDto?.search) {
      query.$or = [
        { fullName: { $regex: filterDto.search, $options: 'i' } },
        { email: { $regex: filterDto.search, $options: 'i' } },
        { employeeId: { $regex: filterDto.search, $options: 'i' } },
        { studentId: { $regex: filterDto.search, $options: 'i' } },
      ];
    }

    return this.userModel
      .find(query)
      .select('-faceData -fingerprintData -googleId')
      .populate('campusId', 'campusCode campusName address')
      .populate('roleId', 'roleName roleCode roleLevel')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Get user by ID
   */
  async findOne(id: string): Promise<User> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(id)
      .select('-faceData -fingerprintData -googleId')
      .populate('campusId', 'campusCode campusName address')
      .populate('roleId', 'roleName roleCode roleLevel')
      .exec();

    if (!user) {
      throw new NotFoundException(`User not found with ID: ${id}`);
    }

    return user;
  }

  /**
   * Update user
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    // Check if email is being updated and if it already exists
    if (updateUserDto.email) {
      const existingUser = await this.userModel
        .findOne({
          email: { $regex: new RegExp(`^${updateUserDto.email}$`, 'i') },
          _id: { $ne: id },
        })
        .exec();

      if (existingUser) {
        throw new ConflictException('Email is already used by another user');
      }
    }

    // Validate roleId if provided
    if (updateUserDto.roleId) {
      if (!Types.ObjectId.isValid(updateUserDto.roleId)) {
        throw new BadRequestException('Invalid role ID');
      }
      const roleExists = await this.roleModel.exists({ _id: updateUserDto.roleId });
      if (!roleExists) {
        throw new BadRequestException('Role does not exist');
      }
      (updateUserDto as any).roleId = new Types.ObjectId(updateUserDto.roleId);
    }

    // Validate campusId if provided
    if (updateUserDto.campusId) {
      if (!Types.ObjectId.isValid(updateUserDto.campusId)) {
        throw new BadRequestException('Invalid campus ID');
      }
      (updateUserDto as any).campusId = new Types.ObjectId(updateUserDto.campusId);
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .select('-faceData -fingerprintData -googleId')
      .populate('campusId', 'campusCode campusName address')
      .populate('roleId', 'roleName roleCode roleLevel')
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`User not found with ID: ${id}`);
    }

    return updatedUser;
  }

  /**
   * Delete user (soft delete - set isActive to false)
   */
  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const result = await this.userModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();

    if (!result) {
      throw new NotFoundException(`User not found with ID: ${id}`);
    }
  }

  /**
   * Activate user
   */
  async activate(id: string): Promise<User> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive: true }, { new: true })
      .select('-faceData -fingerprintData -googleId')
      .populate('campusId', 'campusCode campusName address')
      .populate('roleId', 'roleName roleCode roleLevel')
      .exec();

    if (!user) {
      throw new NotFoundException(`User not found with ID: ${id}`);
    }

    return user;
  }

  /**
   * Ban user (set inactive)
   */
  async ban(id: string): Promise<User> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .select('-faceData -fingerprintData -googleId')
      .populate('campusId', 'campusCode campusName address')
      .populate('roleId', 'roleName roleCode roleLevel')
      .exec();

    if (!user) {
      throw new NotFoundException(`User not found with ID: ${id}`);
    }

    return user;
  }

  /**
   * Unban user (set active)
   */
  async unban(id: string): Promise<User> {
    return this.activate(id);
  }

  /**
   * Get statistics
   */
  async getStatistics(campusFilter: any = {}) {
    const filter = { ...campusFilter };

    const total = await this.userModel.countDocuments(filter);
    const active = await this.userModel.countDocuments({ ...filter, isActive: true });
    const inactive = await this.userModel.countDocuments({ ...filter, isActive: false });

    const byRole = await this.userModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
        },
      },
    ]);

    return {
      total,
      active,
      inactive,
      byRole: byRole.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    };
  }
}
