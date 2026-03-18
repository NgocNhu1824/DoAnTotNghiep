import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@/database/schemas/user.schema';
import { SetPasswordDto } from './dto/set-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) { }

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
