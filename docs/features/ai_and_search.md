# Feature: AI & Content Discovery

CircleSfera leverages intelligent algorithms and vector-based searching to ensure users discover the most relevant content and creators.

## 1. Vector Search (pgvector)

The platform uses the **pgvector** extension in PostgreSQL to perform semantic searches.

- **Logic**: Content (Posts, Bio) is converted into numerical vectors (embeddings).
- **Similarity**: When searching for content, the system identifies similar items based on vector distance, providing more accurate results than simple keyword matching.

## 2. Discovery Algorithms

### The "Frames" Feed

A specialized high-engagement video feed that prioritizes:

- **Engagement**: Content with high like-to-view ratios.
- **Verification**: Content from `VERIFIED`, `BUSINESS`, or `ELITE` creators.
- **Recency**: Prioritizing new content while maintaining a mix of trending established media.

### Follow Suggestions

Algorithmically generated recommendations for the "People to Follow" list:

- **Popularity**: High follower growth.
- **Trust**: Verification status weighted heavily.
- **Niche**: Match based on user's interests (derived from interaction history).

## 3. Future Enhancements

- **AI Moderation**: Automatic flagging of inappropriate images/videos before human review.
- **Smart Captions**: Generative AI suggestions for post descriptions based on media content.
- **Personalized Highlights**: Auto-curating the best user content for their profile summary.
