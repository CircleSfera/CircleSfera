-- Staff can suspend one Profile directly, for one of a closed list of serious
-- causes. The cause is kept on the Profile while the suspension runs: it is
-- what the Profile is told, and a compromised Profile is not offered an appeal.
CREATE TYPE "SuspensionCause" AS ENUM ('CHILD_EXPLOITATION', 'VIOLENCE', 'ILLEGAL', 'HATE_SPEECH', 'HARASSMENT', 'SCAM', 'COMPROMISED');
ALTER TABLE "profiles" ADD COLUMN "suspensionCause" "SuspensionCause";
