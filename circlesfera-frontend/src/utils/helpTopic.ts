import type { TFunction } from 'i18next';
import type { HelpTopic } from '../services/helpCentre.service';

/**
 * The name of a topic of the help centre. The topics are the ones of a
 * request for help, but "something else" reads badly over a list of
 * articles, so that one has its own name here.
 */
export function helpTopicLabel(t: TFunction, topic: HelpTopic): string {
  return topic === 'OTHER'
    ? t('helpCentre.topic_general')
    : t(`supportPage.category.${topic}`);
}
