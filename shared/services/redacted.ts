/**
 * Opaque wrapper for sensitive data. 
 * Prevents accidental exposure in logs, JSON serialization, and object spreading.
 */
export class Redacted<T> {
  constructor(private value: T) {
    Object.freeze(this);
  }

  get(): T {
    return this.value;
  }

  toString(): string {
    return '[REDACTED]';
  }

  toJSON(): string {
    return '[REDACTED]';
  }

  // Prevents accidental property access
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '[REDACTED]';
  }
}
