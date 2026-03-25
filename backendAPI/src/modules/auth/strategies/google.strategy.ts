import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      passReqToCallback: true,
      // Disable session-based state, use custom parameter instead
      store: {
        store: (req, meta, cb) => {
          // Custom store for state
          cb(null);
        },
        verify: (req, providedState, cb) => {
          // Custom verify - always succeed
          cb(null, true, providedState);
        },
      },
    });
  }

  async validate(
    req: any,
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, emails, displayName, photos } = profile;

    const rawState = req.query?.state;
    let campusId = '';
    let client = 'web';
    let redirectUri = '';

    if (rawState) {
      try {
        const parsed = JSON.parse(rawState);
        campusId = parsed?.campusId || '';
        client = parsed?.client || 'web';
        redirectUri = parsed?.redirectUri || '';
      } catch {
        campusId = rawState;
      }
    }

    console.log('🔍 GoogleStrategy validate - campusId from state:', campusId);
    console.log('🔍 GoogleStrategy validate - client from state:', client);
    console.log('🔍 Request query:', req.query);

    const user = {
      googleId: id,
      email: emails[0].value,
      fullName: displayName,
      avatar: photos[0]?.value || '',
      campusId,
      client,
      redirectUri,
    };

    done(null, user);
  }
}
