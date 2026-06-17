const fs = require('fs');
const file = 'circlesfera-backend/src/follows/follows.service.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace findUnique with findFirst for profile
code = code.replace(/this\.prisma\.profile\.findUnique\(\{/g, 'this.prisma.profile.findFirst({');

// Replace where: { username: varName }
code = code.replace(/where: \{ username: ([a-zA-Z0-9_]+) \},/g, "where: { username: { equals: $1, mode: 'insensitive' } },");

// Replace where: { username },
code = code.replace(/where: \{ username \},/g, "where: { username: { equals: username, mode: 'insensitive' } },");

fs.writeFileSync(file, code);
