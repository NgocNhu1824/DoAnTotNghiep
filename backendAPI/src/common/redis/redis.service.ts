import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisClientType, createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly enabled: boolean;
  private readonly keyPrefix: string;

  private client: RedisClientType | null = null;

  constructor(private readonly configService: ConfigService) {
    this.enabled = (this.configService.get<string>('REDIS_ENABLED') || 'false') === 'true';
    this.keyPrefix = this.configService.get<string>('REDIS_KEY_PREFIX') || 'cms:';
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Redis is disabled. Running without distributed cache.');
      return;
    }

    try {
      this.client = this.createRedisClient();
      this.client.on('error', (error: unknown) => {
        this.logger.error(`Redis error: ${error}`);
      });

      await this.client.connect();
      this.logger.log('Redis connected successfully');
    } catch (error) {
      this.client = null;
      this.logger.warn(`Redis connection failed. Fallback to no-cache mode. ${error}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client && this.client.isOpen) {
      await this.client.quit();
    }
  }

  isReady(): boolean {
    return Boolean(this.client && this.client.isOpen);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const client = this.getClient();
    if (!client) {
      return null;
    }

    const rawValue = await client.get(this.withPrefix(key));
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown): Promise<void> {
    const client = this.getClient();
    if (!client) {
      return;
    }

    await client.set(this.withPrefix(key), JSON.stringify(value));
  }

  async del(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      return;
    }

    await client.del(this.withPrefix(key));
  }

  async delMany(keys: string[]): Promise<void> {
    if (!keys.length) {
      return;
    }

    const client = this.getClient();
    if (!client) {
      return;
    }

    const prefixedKeys = keys.map((key) => this.withPrefix(key));
    await client.del(prefixedKeys);
  }

  async delByPattern(pattern: string): Promise<number> {
    const client = this.getClient();
    if (!client) {
      return 0;
    }

    const keys = await client.keys(this.withPrefix(pattern));
    if (!keys.length) {
      return 0;
    }

    await client.del(keys);
    return keys.length;
  }

  private getClient(): RedisClientType | null {
    if (!this.enabled || !this.client || !this.client.isOpen) {
      return null;
    }

    return this.client;
  }

  private withPrefix(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private createRedisClient(): RedisClientType {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      return createClient({
        url: redisUrl,
      });
    }

    const host = this.configService.get<string>('REDIS_HOST') || '127.0.0.1';
    const port = Number(this.configService.get<string>('REDIS_PORT') || 6379);
    const username = this.configService.get<string>('REDIS_USERNAME') || undefined;
    const password = this.configService.get<string>('REDIS_PASSWORD') || undefined;
    const database = Number(this.configService.get<string>('REDIS_DB') || 0);
    const tlsEnabled = (this.configService.get<string>('REDIS_TLS') || 'false') === 'true';

    return createClient({
      username,
      password,
      database: Number.isNaN(database) ? 0 : database,
      socket: {
        host,
        port,
        tls: tlsEnabled,
      },
    });
  }
}
