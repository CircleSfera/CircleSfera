-- Help Desk: the frequently asked questions of the public site become
-- published articles of CircleSfera's help centre, in English and Spanish.
-- Safe to run again: an article or a text that is already there is left as
-- it is, so what the team edits afterwards is never overwritten.

INSERT INTO "helpdesk_articles" ("id", "organizationId", "slug", "topic", "status", "position", "publishedAt", "updatedAt")
VALUES ('hda_faq_free', '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0', 'is-circlesfera-free', 'OTHER', 'PUBLISHED', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId", "slug") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_free_es', a."id", 'es', $t$¿CircleSfera es gratis?$t$, $t$Sí. Las funciones sociales principales son gratis. Hay planes opcionales (Premium, Elite Creator y Business) y herramientas para que los creadores ganen dinero. Los pagos van por Stripe y el precio se ve antes de pagar.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'is-circlesfera-free'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_free_en', a."id", 'en', $t$Is CircleSfera free?$t$, $t$Yes. The main social features are free. There are optional plans (Premium, Elite Creator and Business) and tools for creators to earn money. Payments go through Stripe and the price is shown before you pay.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'is-circlesfera-free'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_articles" ("id", "organizationId", "slug", "topic", "status", "position", "publishedAt", "updatedAt")
VALUES ('hda_faq_verify', '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0', 'identity-verification', 'ACCOUNT', 'PUBLISHED', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId", "slug") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_verify_es', a."id", 'es', $t$¿Cómo funciona la verificación de identidad?$t$, $t$Se hace desde Ajustes con Stripe Identity, cuando la necesitas para ganar dinero o para dar más confianza. Las insignias de plan (Verified, Elite y Business) dependen de tener una suscripción activa.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'identity-verification'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_verify_en', a."id", 'en', $t$How does identity verification work?$t$, $t$You do it from Settings with Stripe Identity, when you need it to earn money or to build trust. Plan badges (Verified, Elite and Business) depend on having an active subscription.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'identity-verification'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_articles" ("id", "organizationId", "slug", "topic", "status", "position", "publishedAt", "updatedAt")
VALUES ('hda_faq_control', '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0', 'control-what-i-see', 'CONTENT', 'PUBLISHED', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId", "slug") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_control_es', a."id", 'es', $t$¿Controlo lo que veo?$t$, $t$Sí. En Ajustes puedes cambiar las preferencias del feed, silenciar y ocultar, y apelar decisiones. Tú eliges qué ves y quién puede interactuar contigo.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'control-what-i-see'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_control_en', a."id", 'en', $t$Do I control what I see?$t$, $t$Yes. In Settings you can change your feed preferences, mute and hide, and appeal decisions. You choose what you see and who can interact with you.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'control-what-i-see'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_articles" ("id", "organizationId", "slug", "topic", "status", "position", "publishedAt", "updatedAt")
VALUES ('hda_faq_mobile', '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0', 'mobile-app', 'OTHER', 'PUBLISHED', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId", "slug") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_mobile_es', a."id", 'es', $t$¿Hay app móvil?$t$, $t$CircleSfera funciona en el navegador del móvil y del escritorio. Puedes añadirla a la pantalla de inicio. Todavía no hay app en App Store ni en Google Play.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'mobile-app'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_mobile_en', a."id", 'en', $t$Is there a mobile app?$t$, $t$CircleSfera works in the browser on your phone and on desktop. You can add it to your home screen. There is no App Store or Google Play app yet.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'mobile-app'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_articles" ("id", "organizationId", "slug", "topic", "status", "position", "publishedAt", "updatedAt")
VALUES ('hda_faq_plans', '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0', 'what-plans-unlock', 'PAYMENTS', 'PUBLISHED', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId", "slug") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_plans_es', a."id", 'es', $t$¿Qué desbloquean los planes?$t$, $t$Premium, Elite Creator y Business son suscripciones opcionales que se cobran con Stripe. Dan una insignia, que exige verificar tu identidad. En Precios ves qué incluye cada una y cuánto cuesta antes de pagar.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'what-plans-unlock'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_plans_en', a."id", 'en', $t$What do the plans unlock?$t$, $t$Premium, Elite Creator and Business are optional subscriptions billed through Stripe. They give a badge, which requires verifying your identity. Pricing shows what each one includes and what it costs before you pay.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'what-plans-unlock'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_articles" ("id", "organizationId", "slug", "topic", "status", "position", "publishedAt", "updatedAt")
VALUES ('hda_faq_support', '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0', 'contact-support', 'OTHER', 'PUBLISHED', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId", "slug") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_support_es', a."id", 'es', $t$¿Cómo contacto con soporte?$t$, $t$Entra en tu cuenta y escribe desde Soporte: una persona te responde en tu solicitud y al correo de tu cuenta. Atendemos todas las solicitudes; las de quienes tienen un plan de pago se responden antes.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'contact-support'
ON CONFLICT ("articleId", "locale") DO NOTHING;

INSERT INTO "helpdesk_article_texts" ("id", "articleId", "locale", "title", "body", "updatedAt")
SELECT 'hda_faq_support_en', a."id", 'en', $t$How do I contact support?$t$, $t$Log in and write from Support: a person replies in your request and to the email on your account. We answer every request; those of people on a paid plan are answered first.$t$, CURRENT_TIMESTAMP
FROM "helpdesk_articles" a
WHERE a."organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0' AND a."slug" = 'contact-support'
ON CONFLICT ("articleId", "locale") DO NOTHING;
