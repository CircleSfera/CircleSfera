-- AlterTable
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");

-- AlterTable
CREATE INDEX "admin_audit_logs_targetId_idx" ON "admin_audit_logs"("targetId");
