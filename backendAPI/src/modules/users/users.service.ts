import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '@/database/schemas/user.schema';
import { Role } from '@/database/schemas/role.schema';
import { Campus } from '@/database/schemas/campus.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilterUserDto } from './dto/filter-user.dto';
import { AppConfig } from '@/config/app.config';
import { UserImportParserHelper } from './helpers/user-import-parser.helper';

const XLSX = require('xlsx');

const CAMPUS_IMPORT_ALIASES: Record<string, string> = {
  fuct: 'fpt university can tho',
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    @InjectModel(Role.name)
    private roleModel: Model<Role>,
    @InjectModel(Campus.name)
    private campusModel: Model<Campus>,
  ) {}

  private normalizeImportValue(value: any): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private parseBooleanValue(value: any, defaultValue = true): boolean {
    if (typeof value === 'boolean') return value;

    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();

    if (!normalized) return defaultValue;
    if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n'].includes(normalized)) return false;

    return defaultValue;
  }

  async generateImportTemplate(): Promise<Buffer> {
    const sampleData = [
      {
        email: 'lecturer1@fpt.edu.vn',
        fullName: 'Nguyen Van A',
        roleCode: 'LECTURER',
        campusCode: 'FUCT',
        employeeId: 'EMP001',
        studentId: '',
        department: 'Information Technology',
        phone: '0901234567',
        isActive: 'true',
      },
      {
        email: 'student1@fpt.edu.vn',
        fullName: 'Tran Thi B',
        roleCode: 'STUDENT',
        campusCode: 'FPT University Can Tho',
        employeeId: '',
        studentId: 'SE182001',
        department: 'Software Engineering',
        phone: '0912345678',
        isActive: 'true',
      },
    ];

    const templateRows = [
      ['Each row represents one user account. Fill left to right, then continue on next row.'],
      ['Columns marked with * are required. campusCode supports FUCT = FPT University Can Tho.'],
      [],
      [
        'email*',
        'fullName*',
        'roleCode*',
        'campusCode*',
        'employeeId',
        'studentId',
        'department',
        'phone',
        'isActive',
      ],
      ...sampleData.map((row) => [
        row.email,
        row.fullName,
        row.roleCode,
        row.campusCode,
        row.employeeId,
        row.studentId,
        row.department,
        row.phone,
        row.isActive,
      ]),
    ];

    const templateWorksheet = XLSX.utils.aoa_to_sheet(templateRows);
    templateWorksheet['!cols'] = [
      { wch: 28 },
      { wch: 24 },
      { wch: 16 },
      { wch: 28 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 14 },
      { wch: 10 },
    ];

    const instructionRows = [
      ['Field', 'Required', 'Description', 'Accepted Values / Example'],
      ['email', 'Yes', 'Unique login email', 'lecturer1@fpt.edu.vn'],
      ['fullName', 'Yes', 'Full name', 'Nguyen Van A'],
      ['roleCode', 'Yes', 'Role code from system role list', 'LECTURER / STUDENT / TRAINING_OFFICER ...'],
      [
        'campusCode',
        'Yes',
        'Campus code or campus name',
        'FUCT (mapped to FPT University Can Tho) or FPT University Can Tho',
      ],
      ['employeeId', 'No', 'Employee identifier', 'EMP001'],
      ['studentId', 'No', 'Student identifier', 'SE182001'],
      ['department', 'No', 'Department text', 'Information Technology'],
      ['phone', 'No', 'Phone number (10 digits)', '0901234567'],
      ['isActive', 'No', 'Activation state', 'true / false'],
    ];

    const instructionWorksheet = XLSX.utils.aoa_to_sheet(instructionRows);
    instructionWorksheet['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 32 }, { wch: 62 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, templateWorksheet, 'UserTemplate');
    XLSX.utils.book_append_sheet(workbook, instructionWorksheet, 'Instructions');

    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    });
  }

  async importUsers(file: any, mode: 'dryRun' | 'strict' = 'strict'): Promise<any> {
    const rawRows = await UserImportParserHelper.parse(file);

    const requiredFields = ['email', 'fullname', 'rolecode', 'campuscode'];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{10}$/;

    const emails = [
      ...new Set(
        rawRows
          .map((row) => String(row.email || '').trim())
          .filter(Boolean)
          .map((email) => email.toLowerCase()),
      ),
    ];

    const employeeIds = [
      ...new Set(
        rawRows
          .map((row) => String(row.employeeid || '').trim())
          .filter(Boolean),
      ),
    ];

    const studentIds = [
      ...new Set(
        rawRows
          .map((row) => String(row.studentid || '').trim())
          .filter(Boolean),
      ),
    ];

    const [existingUsers, roles, campuses] = await Promise.all([
      emails.length > 0 || employeeIds.length > 0 || studentIds.length > 0
        ? this.userModel
            .find({
              $or: [
                ...(emails.length > 0
                  ? [
                      {
                        email: {
                          $in: emails.map((email) => new RegExp(`^${email}$`, 'i')),
                        },
                      },
                    ]
                  : []),
                ...(employeeIds.length > 0 ? [{ employeeId: { $in: employeeIds } }] : []),
                ...(studentIds.length > 0 ? [{ studentId: { $in: studentIds } }] : []),
              ],
            })
            .lean()
            .exec()
        : [],
      this.roleModel.find({ isActive: true }).lean().exec(),
      this.campusModel.find().lean().exec(),
    ]);

    const existingEmailSet = new Set(
      existingUsers.map((user: any) => this.normalizeImportValue(user.email)),
    );
    const existingEmployeeIdSet = new Set(
      existingUsers
        .map((user: any) => String(user.employeeId || '').trim())
        .filter(Boolean),
    );
    const existingStudentIdSet = new Set(
      existingUsers
        .map((user: any) => String(user.studentId || '').trim())
        .filter(Boolean),
    );

    const roleCodeMap = new Map<string, any>();
    const roleNameMap = new Map<string, any>();
    roles.forEach((role: any) => {
      const codeKey = this.normalizeImportValue(role.roleCode);
      const nameKey = this.normalizeImportValue(role.roleName);
      if (codeKey) roleCodeMap.set(codeKey, role);
      if (nameKey) roleNameMap.set(nameKey, role);
    });

    const campusCodeMap = new Map<string, any>();
    const campusNameMap = new Map<string, any>();
    campuses.forEach((campus: any) => {
      const codeKey = this.normalizeImportValue(campus.campusCode);
      const nameKey = this.normalizeImportValue(campus.campusName);
      if (codeKey) campusCodeMap.set(codeKey, campus);
      if (nameKey) campusNameMap.set(nameKey, campus);
    });

    const errors: Array<{
      rowIndex: number;
      field: string;
      code: string;
      message: string;
    }> = [];

    const fileEmailSet = new Set<string>();
    const fileEmployeeIdSet = new Set<string>();
    const fileStudentIdSet = new Set<string>();
    const validRows: any[] = [];

    rawRows.forEach((row, index) => {
      const rowIndex = typeof row.__rowNumber === 'number' ? row.__rowNumber : index + 2;

      requiredFields.forEach((field) => {
        if (!String(row[field] ?? '').trim()) {
          errors.push({
            rowIndex,
            field,
            code: 'REQUIRED',
            message: `Field ${field} is required`,
          });
        }
      });

      const email = String(row.email || '').trim();
      const fullName = String(row.fullname || '').trim();
      const roleInput = this.normalizeImportValue(row.rolecode);
      const campusInput = this.normalizeImportValue(row.campuscode);
      const campusAlias = CAMPUS_IMPORT_ALIASES[campusInput];

      const employeeId = String(row.employeeid || '').trim() || undefined;
      const studentId = String(row.studentid || '').trim() || undefined;
      const department = String(row.department || '').trim() || undefined;
      const phone = String(row.phone || '').trim() || undefined;
      const isActive = this.parseBooleanValue(row.isactive, true);

      if (email) {
        const emailKey = email.toLowerCase();

        if (!emailRegex.test(email)) {
          errors.push({
            rowIndex,
            field: 'email',
            code: 'INVALID_FORMAT',
            message: 'Email format is invalid',
          });
        }

        if (fileEmailSet.has(emailKey)) {
          errors.push({
            rowIndex,
            field: 'email',
            code: 'DUPLICATE_IN_FILE',
            message: `Duplicate email "${email}" in import file`,
          });
        } else {
          fileEmailSet.add(emailKey);
        }

        if (existingEmailSet.has(emailKey)) {
          errors.push({
            rowIndex,
            field: 'email',
            code: 'ALREADY_EXISTS',
            message: `Email "${email}" already exists`,
          });
        }
      }

      if (employeeId) {
        if (fileEmployeeIdSet.has(employeeId)) {
          errors.push({
            rowIndex,
            field: 'employeeId',
            code: 'DUPLICATE_IN_FILE',
            message: `Duplicate employeeId "${employeeId}" in import file`,
          });
        } else {
          fileEmployeeIdSet.add(employeeId);
        }

        if (existingEmployeeIdSet.has(employeeId)) {
          errors.push({
            rowIndex,
            field: 'employeeId',
            code: 'ALREADY_EXISTS',
            message: `employeeId "${employeeId}" already exists`,
          });
        }
      }

      if (studentId) {
        if (fileStudentIdSet.has(studentId)) {
          errors.push({
            rowIndex,
            field: 'studentId',
            code: 'DUPLICATE_IN_FILE',
            message: `Duplicate studentId "${studentId}" in import file`,
          });
        } else {
          fileStudentIdSet.add(studentId);
        }

        if (existingStudentIdSet.has(studentId)) {
          errors.push({
            rowIndex,
            field: 'studentId',
            code: 'ALREADY_EXISTS',
            message: `studentId "${studentId}" already exists`,
          });
        }
      }

      if (phone && !phoneRegex.test(phone)) {
        errors.push({
          rowIndex,
          field: 'phone',
          code: 'INVALID_FORMAT',
          message: 'Phone number must contain exactly 10 digits',
        });
      }

      const role = roleCodeMap.get(roleInput) || roleNameMap.get(roleInput);
      if (roleInput && !role) {
        errors.push({
          rowIndex,
          field: 'roleCode',
          code: 'NOT_FOUND',
          message: `Role "${row.rolecode}" not found. Use a valid roleCode (e.g., STUDENT, LECTURER).`,
        });
      }

      const campus =
        campusCodeMap.get(campusInput) ||
        campusNameMap.get(campusInput) ||
        (campusAlias ? campusNameMap.get(campusAlias) : null);

      if (campusInput && !campus) {
        errors.push({
          rowIndex,
          field: 'campusCode',
          code: 'NOT_FOUND',
          message:
            `Campus "${row.campuscode}" not found. ` +
            'Use campus code/name, or FUCT for FPT University Can Tho.',
        });
      }

      const rowHasError = errors.some((error) => error.rowIndex === rowIndex);
      if (!rowHasError && role && campus) {
        validRows.push({
          email,
          fullName,
          roleId: new Types.ObjectId(role._id),
          campusId: new Types.ObjectId(campus._id),
          employeeId,
          studentId,
          department,
          phone,
          googleId: null,
          isActive,
        });
      }
    });

    const invalidRowSet = new Set(errors.map((error) => error.rowIndex));

    if (mode === 'dryRun') {
      return {
        mode: 'dryRun',
        inserted: 0,
        total: rawRows.length,
        failed: invalidRowSet.size,
        errors,
        preview: rawRows.map((row, index) => {
          const rowIndex = typeof row.__rowNumber === 'number' ? row.__rowNumber : index + 2;
          return {
            rowIndex,
            email: String(row.email || '').trim(),
            fullName: String(row.fullname || '').trim(),
            roleCode: String(row.rolecode || '').trim(),
            campusCode: String(row.campuscode || '').trim(),
            valid: !invalidRowSet.has(rowIndex),
          };
        }),
        summary: {
          total: rawRows.length,
          valid: rawRows.length - invalidRowSet.size,
          invalid: invalidRowSet.size,
          inserted: 0,
          failed: invalidRowSet.size,
        },
      };
    }

    if (errors.length > 0) {
      const failedCount = invalidRowSet.size;
      throw new BadRequestException({
        message: 'Import data contains invalid rows',
        errors,
        total: rawRows.length,
        inserted: 0,
        failed: failedCount,
        summary: {
          total: rawRows.length,
          inserted: 0,
          failed: failedCount,
        },
      });
    }

    if (validRows.length === 0) {
      throw new BadRequestException({
        message: 'No valid rows to import',
        errors: [],
        total: rawRows.length,
        inserted: 0,
        failed: rawRows.length,
        summary: {
          total: rawRows.length,
          inserted: 0,
          failed: rawRows.length,
        },
      });
    }

    try {
      const insertedRows = await this.userModel.insertMany(validRows, { ordered: false });

      return {
        mode: 'strict',
        inserted: insertedRows.length,
        total: rawRows.length,
        failed: 0,
        errors: [],
        summary: {
          total: rawRows.length,
          inserted: insertedRows.length,
          failed: 0,
        },
      };
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException({
          message: 'Duplicate data found while importing users',
          detail: 'Please check email/employeeId/studentId values in file and database',
        });
      }

      throw new InternalServerErrorException({
        message: 'Import users failed',
        error: error?.message || 'Unknown error',
      });
    }
  }

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
      (updateUserDto as any).campusId = new Types.ObjectId(
        updateUserDto.campusId,
      );
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .select('-faceData -fingerprintData -googleId')
      .populate('campusId', 'campusCode campusName address')      .populate('roleId', 'roleName roleCode roleLevel')      .exec();

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
