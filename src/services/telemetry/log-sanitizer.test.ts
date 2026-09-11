import { describe, expect, it } from 'bun:test';
import {
  MAX_LOG_DATA_BYTES,
  sanitizeLogData,
  sanitizeLogMessage,
  sanitizeObject,
  sanitizeString,
  truncateToBytes,
} from './log-sanitizer';

describe('log-sanitizer', () => {
  describe('sanitizeString', () => {
    it('should return input unchanged if no sensitive patterns', () => {
      const input = 'This is a normal log message';
      expect(sanitizeString(input)).toBe(input);
    });

    it('should handle null/undefined/non-string inputs', () => {
      expect(sanitizeString(null as any) as any).toBe(null);
      expect(sanitizeString(undefined as any) as any).toBe(undefined);
      expect(sanitizeString(123 as any) as any).toBe(123);
    });

    describe('API keys, tokens, secrets in key=value format', () => {
      it('should redact API_KEY=value', () => {
        expect(sanitizeString('API_KEY=abc123xyz')).toBe('API_KEY=[REDACTED]');
      });

      it('should redact token: value', () => {
        expect(sanitizeString('token: my-secret-token')).toBe('token: [REDACTED]');
      });

      it('should redact SECRET=value', () => {
        expect(sanitizeString('MY_SECRET=supersecret123')).toBe('MY_SECRET=[REDACTED]');
      });

      it('should redact PASSWORD=value', () => {
        expect(sanitizeString('DB_PASSWORD=hunter2')).toBe('DB_PASSWORD=[REDACTED]');
      });

      it('should redact CREDENTIAL=value', () => {
        expect(sanitizeString('CREDENTIAL=somecred')).toBe('CREDENTIAL=[REDACTED]');
      });

      it('should redact AUTH_TOKEN=value', () => {
        expect(sanitizeString('AUTH_TOKEN=tokenvalue')).toBe('AUTH_TOKEN=[REDACTED]');
      });

      it('should handle multiple sensitive values in one string', () => {
        const input = 'API_KEY=abc123, SECRET=xyz789';
        const result = sanitizeString(input);
        expect(result).toContain('API_KEY=[REDACTED]');
        expect(result).toContain('SECRET=[REDACTED]');
      });
    });

    describe('passwords in URLs', () => {
      it('should redact password in http URL', () => {
        expect(sanitizeString('http://user:password123@example.com')).toBe(
          'http://[REDACTED]:[REDACTED]@example.com',
        );
      });

      it('should redact password in https URL', () => {
        expect(sanitizeString('https://admin:secret@api.example.com/path')).toBe(
          'https://[REDACTED]:[REDACTED]@api.example.com/path',
        );
      });
    });

    describe('Bearer tokens', () => {
      it('should redact Bearer token', () => {
        expect(sanitizeString('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9')).toBe(
          'Authorization: Bearer [REDACTED]',
        );
      });

      it('should be case insensitive', () => {
        expect(sanitizeString('bearer abc123')).toBe('bearer [REDACTED]');
      });
    });

    describe('Basic auth tokens', () => {
      it('should redact Basic auth token', () => {
        expect(sanitizeString('Authorization: Basic dXNlcjpwYXNz')).toBe(
          'Authorization: Basic [REDACTED]',
        );
      });
    });

    describe('AWS access keys', () => {
      it('should redact AWS access keys', () => {
        // Note: aws_access_key_id contains KEY, so the generic key=value pattern also matches.
        // Either redaction marker is acceptable - the sensitive data is removed.
        expect(sanitizeString('aws_access_key_id: AKIAIOSFODNN7EXAMPLE')).toBe(
          'aws_access_key_id: [REDACTED]',
        );
      });

      it('should redact standalone AWS access keys', () => {
        // Standalone AKIA keys without key=value context use AWS_KEY_REDACTED
        expect(sanitizeString('Found key AKIAIOSFODNN7EXAMPLE in config')).toBe(
          'Found key [AWS_KEY_REDACTED] in config',
        );
      });
    });

    describe('GitHub tokens', () => {
      it('should redact ghp_ tokens in key=value format', () => {
        // Note: token= contains TOKEN, so the generic key=value pattern matches.
        // Either redaction marker is acceptable - the sensitive data is removed.
        expect(sanitizeString('token=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(
          'token=[REDACTED]',
        );
      });

      it('should redact standalone ghp_ tokens', () => {
        expect(sanitizeString('Found ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx in logs')).toBe(
          'Found [GITHUB_TOKEN_REDACTED] in logs',
        );
      });

      it('should redact gho_ tokens', () => {
        expect(sanitizeString('gho_abcdefghijklmnopqrstuvwxyz')).toBe('[GITHUB_TOKEN_REDACTED]');
      });

      it('should redact github_pat_ tokens', () => {
        expect(sanitizeString('github_pat_11ABCDEFG_abcdefghijklmnopqrstuvwxyz0123456789')).toBe(
          '[GITHUB_TOKEN_REDACTED]',
        );
      });
    });

    describe('JWT tokens', () => {
      it('should redact JWT tokens', () => {
        const jwt =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
        expect(sanitizeString(jwt)).toBe('[JWT_REDACTED]');
      });
    });

    describe('Private keys', () => {
      it('should redact RSA private keys', () => {
        const key = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0m59l2u9iDnM...
-----END RSA PRIVATE KEY-----`;
        expect(sanitizeString(key)).toBe('[PRIVATE_KEY_REDACTED]');
      });
    });

    describe('Database connection strings', () => {
      it('should redact MongoDB connection strings', () => {
        // Both username and password are redacted for security
        expect(sanitizeString('mongodb://user:password@localhost:27017/db')).toBe(
          'mongodb://[REDACTED]:[REDACTED]@localhost:27017/db',
        );
      });

      it('should redact MongoDB+srv connection strings', () => {
        expect(sanitizeString('mongodb+srv://admin:secret123@cluster.mongodb.net')).toBe(
          'mongodb+srv://[REDACTED]:[REDACTED]@cluster.mongodb.net',
        );
      });

      it('should redact PostgreSQL connection strings', () => {
        expect(sanitizeString('postgres://user:password@localhost/db')).toBe(
          'postgres://[REDACTED]:[REDACTED]@localhost/db',
        );
      });

      it('should redact MySQL connection strings', () => {
        expect(sanitizeString('mysql://root:secret@localhost/mydb')).toBe(
          'mysql://[REDACTED]:[REDACTED]@localhost/mydb',
        );
      });
    });
  });

  describe('sanitizeObject', () => {
    it('should handle null/undefined', () => {
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });

    it('should pass through primitives', () => {
      expect(sanitizeObject(123)).toBe(123);
      expect(sanitizeObject(true)).toBe(true);
      expect(sanitizeObject('hello')).toBe('hello');
    });

    it('should sanitize strings within objects', () => {
      const obj = { url: 'http://user:pass@example.com' };
      expect(sanitizeObject(obj)).toEqual({
        url: 'http://[REDACTED]:[REDACTED]@example.com',
      });
    });

    it('should redact keys that suggest sensitive data', () => {
      const obj = {
        apiKey: 'my-api-key',
        password: 'secret123',
        token: 'abc',
        secretValue: 'hidden',
        authHeader: 'bearer xyz',
      };
      const result = sanitizeObject(obj) as Record<string, unknown>;
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.password).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.secretValue).toBe('[REDACTED]');
      expect(result.authHeader).toBe('[REDACTED]');
    });

    it('should sanitize arrays', () => {
      const arr = ['normal', 'API_KEY=secret'];
      const result = sanitizeObject(arr) as string[];
      expect(result[0]).toBe('normal');
      expect(result[1]).toBe('API_KEY=[REDACTED]');
    });

    it('should handle nested objects', () => {
      const obj = {
        level1: {
          level2: {
            apiKey: 'secret',
            value: 'normal',
          },
        },
      };
      const result = sanitizeObject(obj) as any;
      expect(result.level1.level2.apiKey).toBe('[REDACTED]');
      expect(result.level1.level2.value).toBe('normal');
    });

    it('should prevent infinite recursion with max depth', () => {
      // Create a deeply nested structure
      let obj: any = { value: 'deep' };
      for (let i = 0; i < 15; i++) {
        obj = { nested: obj };
      }
      const result = sanitizeObject(obj) as any;
      // Should not throw and should truncate at max depth
      expect(result).toBeDefined();
    });
  });

  describe('truncateToBytes', () => {
    it('should return input unchanged if under limit', () => {
      const input = 'short string';
      expect(truncateToBytes(input, 100)).toBe(input);
    });

    it('should truncate strings exceeding byte limit', () => {
      const input = 'a'.repeat(200);
      const result = truncateToBytes(input, 100);
      expect(result.length).toBeLessThanOrEqual(104); // 100 bytes + "..."
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle multi-byte characters correctly', () => {
      // Each emoji is 4 bytes
      const input = '😀'.repeat(50); // 200 bytes
      const result = truncateToBytes(input, 100);
      // Should truncate correctly without corrupting UTF-8
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle null/undefined', () => {
      expect(truncateToBytes(null as any, 100) as any).toBe(null);
      expect(truncateToBytes(undefined as any, 100) as any).toBe(undefined);
    });
  });

  describe('sanitizeLogData', () => {
    it('should return undefined for null/undefined', () => {
      expect(sanitizeLogData(null)).toBe(undefined);
      expect(sanitizeLogData(undefined)).toBe(undefined);
    });

    it('should sanitize and serialize objects', () => {
      const data = { apiKey: 'secret', value: 'normal' };
      const result = sanitizeLogData(data);
      expect(result).toBeDefined();
      expect(result).toContain('[REDACTED]');
      expect(result).toContain('normal');
    });

    it('should truncate large payloads', () => {
      const data = { largeField: 'x'.repeat(2000) };
      const result = sanitizeLogData(data);
      expect(result).toBeDefined();
      expect(result!.length).toBeLessThanOrEqual(MAX_LOG_DATA_BYTES + 3); // +3 for "..."
    });

    it('should handle circular references via depth limiting', () => {
      // Create circular reference
      const obj: any = { value: 'test' };
      obj.self = obj;
      const result = sanitizeLogData(obj);
      // Circular refs are handled by depth limiting, resulting in [MAX_DEPTH_EXCEEDED]
      expect(result).toBeDefined();
      expect(result).toContain('[MAX_DEPTH_EXCEEDED]');
    });
  });

  describe('sanitizeLogMessage', () => {
    it('should sanitize log messages', () => {
      const message = 'Failed to authenticate with API_KEY=secret123';
      const result = sanitizeLogMessage(message);
      expect(result).toBe('Failed to authenticate with API_KEY=[REDACTED]');
    });

    it('should handle normal messages', () => {
      const message = 'Operation completed successfully';
      expect(sanitizeLogMessage(message)).toBe(message);
    });
  });
});
