-- The help article "Is CircleSfera free?" names the four optional plans,
-- now that Verified is one of them.
UPDATE "helpdesk_article_texts"
SET "body" = $t$Sí. Las funciones sociales principales son gratis. Hay planes opcionales (Verified, Premium, Elite Creator y Business) y herramientas para que los creadores ganen dinero. Los pagos van por Stripe y el precio se ve antes de pagar.$t$,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'hda_faq_free_es'
  AND "body" LIKE '%(Premium, Elite Creator y Business)%';

UPDATE "helpdesk_article_texts"
SET "body" = $t$Yes. The main social features are free. There are optional plans (Verified, Premium, Elite Creator and Business) and tools for creators to earn money. Payments go through Stripe and the price is shown before you pay.$t$,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'hda_faq_free_en'
  AND "body" LIKE '%(Premium, Elite Creator and Business)%';
