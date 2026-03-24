import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const campusId = request.query.campusId;
    const client = request.query.client || 'web';
    const redirectUri = request.query.redirectUri || '';

    const oauthState = JSON.stringify({
      campusId: campusId || '',
      client,
      redirectUri,
    });

    console.log('🔍 GoogleAuthGuard - oauth state:', oauthState);

    return {
      state: oauthState,
    };
  }
}
