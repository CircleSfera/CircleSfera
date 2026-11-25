// The job of the in-app reminder that a founding creator's free year ends
// (BD-034), queued through the outbox by the payments module. It carries ids
// only: the notice is written when the job runs, from the year as it is then.
export const FREE_YEAR_ENDING_NOTICE_JOB = 'create-free-year-ending-notice';

export interface FreeYearEndingNoticeJob {
  applicationId: string;
  kind: 'free-year-ending-notice';
}
