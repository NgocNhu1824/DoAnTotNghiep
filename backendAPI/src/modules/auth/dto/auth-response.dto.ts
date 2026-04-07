export class AuthResponseDto {
  success: boolean;
  accessToken: string;
  hasPassword?: boolean;
  user: {
    id: string;
    email: string;
    fullName: string;
    avatar: string;
    roleId?: string;
    campusId: any; // Can be string (ID) or Campus object (populated)
    hasFaceId?: boolean;
    hasFingerId?: boolean;
  };
  roleDetails?: {
    id: string;
    roleCode: string;
    roleName: string;
    roleLevel: number;
    scope: string;
    description: string;
  };
  permissions?: Array<{
    id: string;
    permissionName: string;
    resource: string;
    action: string;
    description: string;
  }>;
}
