import { Injectable } from '@nestjs/common';

/** Root application service providing health-check endpoints. */
@Injectable()
export class AppService {
  /** Returns a simple greeting string. Used by the root GET endpoint. */
  getHello(): string {
    return 'Hello World!';
  }
}
