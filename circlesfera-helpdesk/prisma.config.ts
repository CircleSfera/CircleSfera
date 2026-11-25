import * as dotenv from 'dotenv';

dotenv.config();

// The Help Desk has a database of its own (ADR-0034), named by its own
// variable so it can never be pointed at CircleSfera's by accident.
export default {
  datasource: {
    url: process.env.HELPDESK_DATABASE_URL,
  },
};
