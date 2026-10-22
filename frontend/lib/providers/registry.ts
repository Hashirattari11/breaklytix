/**
 * Breaklytix Provider Registry
 *
 * Security rules:
 * - No secret VALUES stored, only environment variable NAMES as string labels
 * - Evidence text always reads like "Environment variable reference: STRIPE_SECRET_KEY"
 * - Never constructs strings like "STRIPE_SECRET_KEY = sk_live_..."
 * - monitoringStatus mirrors the backend registry: every provider listed in
 *   backend/app/changelog/sources.py has an official changelog source and is
 *   polled on a schedule, so all 44 are "supported". Marking 32 of them
 *   "planned" made the homepage badge ("Monitored" vs "Detected") contradict
 *   /providers and the 44-provider claim. Runtime health is a separate signal,
 *   reported per provider by the API and shown on /dashboard/providers.
 *
 * Adding a new provider: append to PROVIDER_REGISTRY array.
 * The scanner picks up new entries automatically — no other code changes needed.
 */
import { ProviderEntry, ProviderCategory } from "./types";

export const PROVIDER_REGISTRY: readonly ProviderEntry[] = [
  // -------------------------------------------------------------------------
  // 1. Stripe
  // -------------------------------------------------------------------------
  {
    id: "stripe",
    displayName: "Stripe",
    category: "payment",
    detectionPatterns: {
      envVarNames: [
        "STRIPE_SECRET_KEY",
        "STRIPE_PUBLISHABLE_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_API_KEY",
      ],
      importPatterns: [
        "import stripe",
        "from stripe",
        "require\\(['\"]stripe['\"]\\)",
        "new Stripe\\(",
        "Stripe\\(",
        "stripe\\.(Charge|Customer|PaymentIntent|SetupIntent|Subscription|Invoice|Refund|Payout|Source|Token|Card|Price|Product|Checkout|PaymentMethod)\\b",
      ],
      packageNames: ["stripe", "@stripe/stripe-js", "stripe-node"],
      endpointPatterns: [
        "api\\.stripe\\.com",
        "hooks\\.stripe\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://stripe.com/docs/changelog",
      releaseNotesUrl: "https://stripe.com/docs/upgrades",
      pollingFrequency: "daily",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 2. Shopify
  // -------------------------------------------------------------------------
  {
    id: "shopify",
    displayName: "Shopify",
    category: "payment",
    detectionPatterns: {
      envVarNames: [
        "SHOPIFY_API_KEY",
        "SHOPIFY_API_SECRET",
        "SHOPIFY_ACCESS_TOKEN",
        "SHOPIFY_API_SECRET_KEY",
      ],
      importPatterns: [
        "import shopify",
        "from shopify",
        "require\\(['\"]@shopify/shopify-api['\"]\\)",
        "require\\(['\"]shopify-api-node['\"]\\)",
        "@shopify/shopify-api",
        "@shopify/shopify-app-react-router",
        "@shopify/app-bridge-react",
        "shopify_api",
      ],
      packageNames: [
        "shopify",
        "@shopify/shopify-api",
        "@shopify/shopify-app-react-router",
        "@shopify/app-bridge-react",
      ],
      endpointPatterns: [
        "myshopify\\.com",
        "shopify\\.com/api",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://shopify.dev/changelog",
      releaseNotesUrl: "https://shopify.dev/docs/releases",
      pollingFrequency: "daily",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 3. Twilio
  // -------------------------------------------------------------------------
  {
    id: "twilio",
    displayName: "Twilio",
    category: "communication",
    detectionPatterns: {
      envVarNames: [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_API_KEY",
        "TWILIO_API_SECRET",
      ],
      importPatterns: [
        "from twilio",
        "import twilio",
        "require\\(['\"]twilio['\"]\\)",
        "twilio\\.rest",
      ],
      packageNames: ["twilio"],
      endpointPatterns: [
        "twilio\\.com",
        "api\\.twilio\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://www.twilio.com/en-us/changelog",
      releaseNotesUrl: "https://www.twilio.com/docs/release-notes",
      pollingFrequency: "daily",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 4. SendGrid
  // -------------------------------------------------------------------------
  {
    id: "sendgrid",
    displayName: "SendGrid",
    category: "communication",
    detectionPatterns: {
      envVarNames: ["SENDGRID_API_KEY"],
      importPatterns: [
        "import sendgrid",
        "from sendgrid",
        "require\\(['\"]@sendgrid/mail['\"]\\)",
        "require\\(['\"]@sendgrid/client['\"]\\)",
        "@sendgrid/mail",
        "@sendgrid/client",
      ],
      packageNames: ["@sendgrid/mail", "@sendgrid/client", "sendgrid"],
      endpointPatterns: [
        "api\\.sendgrid\\.com",
        "sendgrid\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://docs.sendgrid.com/for-developers/changelog",
      releaseNotesUrl: "https://docs.sendgrid.com/release-notes",
      pollingFrequency: "daily",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 5. GitHub
  // -------------------------------------------------------------------------
  {
    id: "github",
    displayName: "GitHub",
    category: "devtools",
    detectionPatterns: {
      envVarNames: [
        "GITHUB_TOKEN",
        "GH_TOKEN",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_APP_ID",
      ],
      importPatterns: [
        "from github import",
        "import github",
        "PyGithub",
        "@octokit/rest",
        "require\\(['\"]@octokit/rest['\"]\\)",
        "@actions/github",
        "require\\(['\"]@actions/github['\"]\\)",
      ],
      packageNames: ["@octokit/rest", "octokit", "@actions/github"],
      endpointPatterns: [
        "api\\.github\\.com",
        "github\\.com/repos",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://github.blog/changelog/",
      releaseNotesUrl: "https://docs.github.com/en/releases",
      pollingFrequency: "daily",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 6. OpenAI
  // -------------------------------------------------------------------------
  {
    id: "openai",
    displayName: "OpenAI",
    category: "ai",
    detectionPatterns: {
      envVarNames: ["OPENAI_API_KEY"],
      importPatterns: [
        "import openai",
        "from openai",
        "require\\(['\"]openai['\"]\\)",
        "new OpenAI\\(",
        "OpenAI\\(",
      ],
      packageNames: ["openai"],
      endpointPatterns: [
        "api\\.openai\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://platform.openai.com/docs/changelog",
      releaseNotesUrl: "https://platform.openai.com/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 7. Anthropic
  // -------------------------------------------------------------------------
  {
    id: "anthropic",
    displayName: "Anthropic",
    category: "ai",
    detectionPatterns: {
      envVarNames: ["ANTHROPIC_API_KEY"],
      importPatterns: [
        "import anthropic",
        "from anthropic",
        "require\\(['\"]@anthropic-ai/sdk['\"]\\)",
        "require\\(['\"]anthropic['\"]\\)",
        "@anthropic-ai/sdk",
        "new Anthropic\\(",
        "Anthropic\\(",
      ],
      packageNames: ["@anthropic-ai/sdk", "anthropic"],
      endpointPatterns: [
        "api\\.anthropic\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://docs.anthropic.com/en/docs/about-claude/changelog",
      releaseNotesUrl: "https://docs.anthropic.com/en/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 8. PayPal
  // -------------------------------------------------------------------------
  {
    id: "paypal",
    displayName: "PayPal",
    category: "payment",
    detectionPatterns: {
      envVarNames: [
        "PAYPAL_CLIENT_ID",
        "PAYPAL_CLIENT_SECRET",
        "PAYPAL_MODE",
      ],
      importPatterns: [
        "require\\(['\"]@paypal/checkout-server-sdk['\"]\\)",
        "require\\(['\"]@paypal/react-paypal-js['\"]\\)",
        "require\\(['\"]paypal-rest-sdk['\"]\\)",
        "@paypal/checkout-server-sdk",
        "@paypal/react-paypal-js",
        "paypal-rest-sdk",
        "import paypal",
        "from paypal",
      ],
      packageNames: [
        "@paypal/checkout-server-sdk",
        "@paypal/react-paypal-js",
        "paypal-rest-sdk",
      ],
      endpointPatterns: [
        "api\\.paypal\\.com",
        "paypal\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://developer.paypal.com/docs/release-notes/",
      releaseNotesUrl: "https://developer.paypal.com/docs/release-notes/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 9. Resend
  // -------------------------------------------------------------------------
  {
    id: "resend",
    displayName: "Resend",
    category: "communication",
    detectionPatterns: {
      envVarNames: ["RESEND_API_KEY"],
      importPatterns: [
        "import resend",
        "from resend",
        "require\\(['\"]resend['\"]\\)",
        "new Resend\\(",
        "Resend\\(",
      ],
      packageNames: ["resend"],
      endpointPatterns: [
        "api\\.resend\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://resend.com/changelog",
      releaseNotesUrl: "https://resend.com/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 10. Slack
  // -------------------------------------------------------------------------
  {
    id: "slack",
    displayName: "Slack",
    category: "communication",
    detectionPatterns: {
      envVarNames: [
        "SLACK_BOT_TOKEN",
        "SLACK_SIGNING_SECRET",
        "SLACK_WEBHOOK_URL",
        "SLACK_APP_TOKEN",
      ],
      importPatterns: [
        "@slack/bolt",
        "@slack/web-api",
        "require\\(['\"]@slack/bolt['\"]\\)",
        "require\\(['\"]@slack/web-api['\"]\\)",
        "import slack",
        "from slack",
      ],
      packageNames: ["@slack/bolt", "@slack/web-api"],
      endpointPatterns: [
        "slack\\.com/api",
        "hooks\\.slack\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://slack.com/changelog",
      releaseNotesUrl: "https://api.slack.com/changelog",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 11. Supabase
  // -------------------------------------------------------------------------
  {
    id: "supabase",
    displayName: "Supabase",
    category: "database",
    detectionPatterns: {
      envVarNames: [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ],
      importPatterns: [
        "import supabase",
        "from supabase",
        "require\\(['\"]@supabase/supabase-js['\"]\\)",
        "@supabase/supabase-js",
        "createClient\\(",
      ],
      packageNames: ["@supabase/supabase-js"],
      endpointPatterns: [
        "supabase\\.co",
        "supabase\\.in",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://supabase.com/changelog",
      releaseNotesUrl: "https://supabase.com/docs/guides/getting-started/releases",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 12. Firebase
  // -------------------------------------------------------------------------
  {
    id: "firebase",
    displayName: "Firebase",
    category: "cloud",
    detectionPatterns: {
      envVarNames: [
        "FIREBASE_API_KEY",
        "FIREBASE_PROJECT_ID",
        "FIREBASE_CLIENT_EMAIL",
      ],
      importPatterns: [
        "import firebase",
        "from firebase",
        "require\\(['\"]firebase['\"]\\)",
        "require\\(['\"]firebase-admin['\"]\\)",
        "firebase",
        "firebase-admin",
        "initializeApp\\(",
      ],
      packageNames: ["firebase", "firebase-admin"],
      endpointPatterns: [
        "firebaseio\\.com",
        "firestore\\.googleapis\\.com",
        "firebase\\.google\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://firebase.google.com/support/releases",
      releaseNotesUrl: "https://firebase.google.com/support/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 13. AWS
  // -------------------------------------------------------------------------
  {
    id: "aws",
    displayName: "AWS",
    category: "cloud",
    detectionPatterns: {
      envVarNames: [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_REGION",
      ],
      importPatterns: [
        "import boto3",
        "from boto3",
        "require\\(['\"]aws-sdk['\"]\\)",
        "@aws-sdk/",
        "aws-sdk",
        "boto3",
      ],
      packageNames: ["aws-sdk", "@aws-sdk/client-s3", "@aws-sdk/client-sqs", "@aws-sdk/client-dynamodb"],
      endpointPatterns: [
        "amazonaws\\.com",
        "aws\\.amazon\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://aws.amazon.com/about-aws/whats-new/",
      releaseNotesUrl: "https://docs.aws.amazon.com/awsreleasehistory/latest/release-history/RELEASE_HISTORY.html",
      pollingFrequency: "daily",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 14. Vercel
  // -------------------------------------------------------------------------
  {
    id: "vercel",
    displayName: "Vercel",
    category: "cloud",
    detectionPatterns: {
      envVarNames: ["VERCEL_TOKEN"],
      importPatterns: [
        "require\\(['\"]@vercel/client['\"]\\)",
        "@vercel/client",
        "import vercel",
        "from vercel",
      ],
      packageNames: ["@vercel/client"],
      endpointPatterns: [
        "api\\.vercel\\.com",
        "vercel\\.app",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://vercel.com/changelog",
      releaseNotesUrl: "https://vercel.com/docs/platform/changelog",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // 15. Cloudinary
  // -------------------------------------------------------------------------
  {
    id: "cloudinary",
    displayName: "Cloudinary",
    category: "media",
    detectionPatterns: {
      envVarNames: [
        "CLOUDINARY_URL",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
      ],
      importPatterns: [
        "import cloudinary",
        "from cloudinary",
        "require\\(['\"]cloudinary['\"]\\)",
        "cloudinary\\.v2",
        "Cloudinary\\(",
      ],
      packageNames: ["cloudinary"],
      endpointPatterns: [
        "cloudinary\\.com",
        "res\\.cloudinary\\.com",
      ],
    },
    changelogConfig: {
      changelogUrl: "https://cloudinary.com/releases",
      releaseNotesUrl: "https://cloudinary.com/documentation",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 16. Google AI / Gemini
  // -------------------------------------------------------------------------
  {
    id: "googleai",
    displayName: "Google AI / Gemini",
    category: "ai",
    detectionPatterns: {
      envVarNames: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
      importPatterns: ["@google/generative-ai", "@google/genai", "GenerativeModel\\("],
      packageNames: ["@google/generative-ai", "@google/genai"],
      endpointPatterns: ["generativelanguage\\.googleapis\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://ai.google.dev/gemini-api/docs/changelog",
      releaseNotesUrl: "https://ai.google.dev/gemini-api/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 17. Hugging Face
  // -------------------------------------------------------------------------
  {
    id: "huggingface",
    displayName: "Hugging Face",
    category: "ai",
    detectionPatterns: {
      envVarNames: ["HF_TOKEN", "HUGGINGFACEHUB_API_TOKEN"],
      importPatterns: ["@huggingface/inference", "@huggingface/hub", "InferenceClient\\("],
      packageNames: ["@huggingface/inference", "@huggingface/hub", "huggingface"],
      endpointPatterns: ["huggingface\\.co"],
    },
    changelogConfig: {
      changelogUrl: "https://huggingface.co/docs/api-inference/changelog",
      releaseNotesUrl: "https://huggingface.co/docs/api-inference/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 18. ElevenLabs
  // -------------------------------------------------------------------------
  {
    id: "elevenlabs",
    displayName: "ElevenLabs",
    category: "ai",
    detectionPatterns: {
      envVarNames: ["ELEVENLABS_API_KEY"],
      importPatterns: ["import elevenlabs", "from elevenlabs", "ElevenLabs\\("],
      packageNames: ["elevenlabs"],
      endpointPatterns: ["api\\.elevenlabs\\.io"],
    },
    changelogConfig: {
      changelogUrl: "https://elevenlabs.io/docs/changelog",
      releaseNotesUrl: "https://elevenlabs.io/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 19. Postmark
  // -------------------------------------------------------------------------
  {
    id: "postmark",
    displayName: "Postmark",
    category: "communication",
    detectionPatterns: {
      envVarNames: ["POSTMARK_SERVER_TOKEN"],
      importPatterns: ["import postmark", "from postmark", "postmark\\.send"],
      packageNames: ["postmark"],
      endpointPatterns: ["api\\.postmarkapp\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://postmarkapp.com/changelog",
      releaseNotesUrl: "https://postmarkapp.com/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 20. Mailgun
  // -------------------------------------------------------------------------
  {
    id: "mailgun",
    displayName: "Mailgun",
    category: "communication",
    detectionPatterns: {
      envVarNames: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN"],
      importPatterns: ["mailgun\\.js", "mailgun-js", "require\\(['\"]mailgun\\.js['\"]\\)"],
      packageNames: ["mailgun.js", "mailgun-js"],
      endpointPatterns: ["api\\.mailgun\\.net"],
    },
    changelogConfig: {
      changelogUrl: "https://www.mailgun.com/changelog/",
      releaseNotesUrl: "https://www.mailgun.com/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 21. DigitalOcean
  // -------------------------------------------------------------------------
  {
    id: "digitalocean",
    displayName: "DigitalOcean",
    category: "cloud",
    detectionPatterns: {
      envVarNames: ["DIGITALOCEAN_ACCESS_TOKEN"],
      importPatterns: ["do-wrapper", "DoWrapper\\(", "digitalocean"],
      packageNames: ["do-wrapper"],
      endpointPatterns: ["api\\.digitalocean\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://docs.digitalocean.com/release-notes/api/",
      releaseNotesUrl: "https://docs.digitalocean.com/release-notes/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 22. Sentry
  // -------------------------------------------------------------------------
  {
    id: "sentry",
    displayName: "Sentry",
    category: "devtools",
    detectionPatterns: {
      envVarNames: ["SENTRY_DSN", "SENTRY_AUTH_TOKEN"],
      importPatterns: ["@sentry/nextjs", "@sentry/node", "@sentry/browser", "Sentry\\.init"],
      packageNames: ["@sentry/nextjs", "@sentry/node", "@sentry/browser", "@sentry/react"],
      endpointPatterns: ["ingest\\.sentry\\.io"],
    },
    changelogConfig: {
      changelogUrl: "https://develop.sentry.dev/changelog/",
      releaseNotesUrl: "https://develop.sentry.dev/changelog/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 23. Auth0
  // -------------------------------------------------------------------------
  {
    id: "auth0",
    displayName: "Auth0",
    category: "devtools",
    detectionPatterns: {
      envVarNames: ["AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_SECRET", "AUTH0_BASE_URL"],
      importPatterns: ["@auth0/auth0-react", "@auth0/nextjs-auth0", "@auth0/auth0-spa-js", "Auth0Provider"],
      packageNames: ["@auth0/auth0-react", "@auth0/nextjs-auth0", "@auth0/auth0-spa-js"],
      endpointPatterns: ["auth0\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://auth0.com/changelog",
      releaseNotesUrl: "https://auth0.com/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 24. Clerk
  // -------------------------------------------------------------------------
  {
    id: "clerk",
    displayName: "Clerk",
    category: "devtools",
    detectionPatterns: {
      envVarNames: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      importPatterns: ["@clerk/nextjs", "@clerk/clerk-react", "@clerk/clerk-sdk-node", "<ClerkProvider"],
      packageNames: ["@clerk/nextjs", "@clerk/clerk-react", "@clerk/clerk-sdk-node"],
      endpointPatterns: ["clerk\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://clerk.com/changelog",
      releaseNotesUrl: "https://clerk.com/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 25. Mapbox
  // -------------------------------------------------------------------------
  {
    id: "mapbox",
    displayName: "Mapbox",
    category: "other",
    detectionPatterns: {
      envVarNames: ["MAPBOX_ACCESS_TOKEN"],
      importPatterns: ["mapbox-gl", "@mapbox/mapbox-gl-js", "mapboxgl\\.accessToken"],
      packageNames: ["mapbox-gl", "@mapbox/mapbox-gl-js"],
      endpointPatterns: ["api\\.mapbox\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://docs.mapbox.com/changelog/",
      releaseNotesUrl: "https://docs.mapbox.com/api/release-notes/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 26. Algolia
  // -------------------------------------------------------------------------
  {
    id: "algolia",
    displayName: "Algolia",
    category: "devtools",
    detectionPatterns: {
      envVarNames: ["ALGOLIA_APP_ID", "ALGOLIA_API_KEY", "ALGOLIA_ADMIN_API_KEY"],
      importPatterns: ["algoliasearch\\(", "import algoliasearch", "from algoliasearch"],
      packageNames: ["algoliasearch"],
      endpointPatterns: ["\\.algolia\\.net"],
    },
    changelogConfig: {
      changelogUrl: "https://www.algolia.com/changelog/",
      releaseNotesUrl: "https://www.algolia.com/doc/rest-api/release-notes/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 27. PostHog
  // -------------------------------------------------------------------------
  {
    id: "posthog",
    displayName: "PostHog",
    category: "analytics",
    detectionPatterns: {
      envVarNames: ["POSTHOG_API_KEY", "NEXT_PUBLIC_POSTHOG_KEY"],
      importPatterns: ["posthog-js", "posthog-node", "posthog\\.init"],
      packageNames: ["posthog-js", "posthog-node"],
      endpointPatterns: ["posthog\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://posthog.com/changelog",
      releaseNotesUrl: "https://posthog.com/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 28. Mixpanel
  // -------------------------------------------------------------------------
  {
    id: "mixpanel",
    displayName: "Mixpanel",
    category: "analytics",
    detectionPatterns: {
      envVarNames: ["MIXPANEL_TOKEN", "MIXPANEL_PROJECT_TOKEN"],
      importPatterns: ["mixpanel-browser", "mixpanel\\.init", "import mixpanel"],
      packageNames: ["mixpanel", "mixpanel-browser"],
      endpointPatterns: ["api\\.mixpanel\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://developer.mixpanel.com/changelog",
      releaseNotesUrl: "https://developer.mixpanel.com/docs/release-notes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 29. Segment
  // -------------------------------------------------------------------------
  {
    id: "segment",
    displayName: "Segment",
    category: "analytics",
    detectionPatterns: {
      envVarNames: ["SEGMENT_WRITE_KEY"],
      importPatterns: ["@segment/analytics-node", "@segment/analytics-next", "Analytics\\("],
      packageNames: ["@segment/analytics-node", "@segment/analytics-next"],
      endpointPatterns: ["api\\.segment\\.io"],
    },
    changelogConfig: {
      changelogUrl: "https://segment.com/docs/changelog/",
      releaseNotesUrl: "https://segment.com/docs/release-notes/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase C — 30. Intercom
  // -------------------------------------------------------------------------
  {
    id: "intercom",
    displayName: "Intercom",
    category: "analytics",
    detectionPatterns: {
      envVarNames: ["INTERCOM_ACCESS_TOKEN"],
      importPatterns: ["intercom-client", "Intercom\\(", "import intercom"],
      packageNames: ["intercom-client", "intercom-node"],
      endpointPatterns: ["api\\.intercom\\.io"],
    },
    changelogConfig: {
      changelogUrl: "https://developers.intercom.com/changelog/",
      releaseNotesUrl: "https://developers.intercom.com/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 31. Discord
  // -------------------------------------------------------------------------
  {
    id: "discord",
    displayName: "Discord",
    category: "communication",
    detectionPatterns: {
      envVarNames: ["DISCORD_TOKEN", "DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
      importPatterns: ["import discord", "from discord", "discord\\.js", "new Client\\(\\s*\\{\\s*intents"],
      packageNames: ["discord.js", "@discordjs/rest"],
      endpointPatterns: ["discord\\.com\\/api"],
    },
    changelogConfig: {
      changelogUrl: "https://discord.com/developers/docs/change-log",
      releaseNotesUrl: "https://discord.com/developers/docs/change-log",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 32. Telegram
  // -------------------------------------------------------------------------
  {
    id: "telegram",
    displayName: "Telegram",
    category: "communication",
    detectionPatterns: {
      envVarNames: ["TELEGRAM_BOT_TOKEN"],
      importPatterns: ["import telegram", "from telegram", "Telegraf\\(", "TelegramBot\\("],
      packageNames: ["telegram", "telegraf", "node-telegram-bot-api"],
      endpointPatterns: ["api\\.telegram\\.org"],
    },
    changelogConfig: {
      changelogUrl: "https://core.telegram.org/bots/api#recent-changes",
      releaseNotesUrl: "https://core.telegram.org/bots/api#recent-changes",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 33. WhatsApp
  // -------------------------------------------------------------------------
  {
    id: "whatsapp",
    displayName: "WhatsApp",
    category: "communication",
    detectionPatterns: {
      envVarNames: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_FROM_PHONE", "WHATSAPP_API_TOKEN"],
      importPatterns: ["@whatsapp\\/cloud-api", "whatsapp-cloud-api"],
      packageNames: ["@whatsapp/cloud-api"],
      endpointPatterns: ["graph\\.facebook\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/changelog",
      releaseNotesUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/changelog",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 34. Twitter (X)
  // -------------------------------------------------------------------------
  {
    id: "twitter",
    displayName: "Twitter (X)",
    category: "communication",
    detectionPatterns: {
      envVarNames: ["TWITTER_API_KEY", "TWITTER_API_SECRET", "TWITTER_ACCESS_TOKEN", "TWITTER_ACCESS_SECRET", "TWITTER_BEARER_TOKEN"],
      importPatterns: ["import tweepy", "from tweepy", "import twitter", "twitter\\.v2", "twitter-api-v2"],
      packageNames: ["twitter-api-v2", "twitter", "tweepy"],
      endpointPatterns: ["api\\.twitter\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://developer.x.com/en/docs/x-api/changelog",
      releaseNotesUrl: "https://developer.x.com/en/docs/x-api/changelog",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 35. Zoom
  // -------------------------------------------------------------------------
  {
    id: "zoom",
    displayName: "Zoom",
    category: "communication",
    detectionPatterns: {
      envVarNames: ["ZOOM_API_KEY", "ZOOM_API_SECRET", "ZOOM_JWT_TOKEN"],
      importPatterns: ["import zoom", "from zoom", "@zoom\\/videosdk"],
      packageNames: ["@zoom/videosdk", "zoom-embedded"],
      endpointPatterns: ["api\\.zoom\\.us"],
    },
    changelogConfig: {
      changelogUrl: "https://developers.zoom.us/docs/changelog/",
      releaseNotesUrl: "https://developers.zoom.us/docs/changelog/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 36. Pusher
  // -------------------------------------------------------------------------
  {
    id: "pusher",
    displayName: "Pusher",
    category: "communication",
    detectionPatterns: {
      envVarNames: ["PUSHER_APP_ID", "PUSHER_KEY", "PUSHER_SECRET", "PUSHER_CLUSTER"],
      importPatterns: ["import pusher", "from pusher", "new Pusher\\("],
      packageNames: ["pusher"],
      endpointPatterns: [],
    },
    changelogConfig: {
      changelogUrl: "https://pusher.com/docs/changelog/",
      releaseNotesUrl: "https://pusher.com/docs/changelog/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 37. YouTube
  // -------------------------------------------------------------------------
  {
    id: "youtube",
    displayName: "YouTube",
    category: "media",
    detectionPatterns: {
      envVarNames: ["YOUTUBE_API_KEY", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
      importPatterns: ["import googleapiclient", "@googleapis\\/youtube", "youtube\\.v3"],
      packageNames: ["@googleapis/youtube", "googleapis"],
      endpointPatterns: ["www\\.youtube\\.com\\/api"],
    },
    changelogConfig: {
      changelogUrl: "https://developers.google.com/youtube/v3/revision_history",
      releaseNotesUrl: "https://developers.google.com/youtube/v3/revision_history",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 38. Notion
  // -------------------------------------------------------------------------
  {
    id: "notion",
    displayName: "Notion",
    category: "other",
    detectionPatterns: {
      envVarNames: ["NOTION_API_KEY", "NOTION_TOKEN", "NOTION_SECRET"],
      importPatterns: ["import notion", "from notion", "notion_client", "@notionhq\\/client"],
      packageNames: ["@notionhq/client", "notion-client", "notion"],
      endpointPatterns: ["api\\.notion\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://developers.notion.com/changelog",
      releaseNotesUrl: "https://developers.notion.com/changelog",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 39. Airtable
  // -------------------------------------------------------------------------
  {
    id: "airtable",
    displayName: "Airtable",
    category: "database",
    detectionPatterns: {
      envVarNames: ["AIRTABLE_API_KEY", "AIRTABLE_BASE_ID", "AIRTABLE_PAT"],
      importPatterns: ["import airtable", "from airtable", "import pyairtable", "Airtable\\("],
      packageNames: ["airtable", "pyairtable"],
      endpointPatterns: ["api\\.airtable\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://airtable.com/developers/web/api/changelog",
      releaseNotesUrl: "https://airtable.com/developers/web/api/changelog",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 40. MongoDB
  // -------------------------------------------------------------------------
  {
    id: "mongodb",
    displayName: "MongoDB",
    category: "database",
    detectionPatterns: {
      envVarNames: ["MONGODB_URI", "MONGODB_URL", "MONGODB_CONNECTION_STRING", "MONGO_URI"],
      importPatterns: ["import pymongo", "from pymongo", "MongoClient\\(", "mongoose\\.connect"],
      packageNames: ["mongodb", "mongoose", "pymongo"],
      endpointPatterns: ["mongodb\\+srv:\\/\\/"],
    },
    changelogConfig: {
      changelogUrl: "https://www.mongodb.com/docs/upcoming/release-notes/",
      releaseNotesUrl: "https://www.mongodb.com/docs/upcoming/release-notes/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 41. Redis
  // -------------------------------------------------------------------------
  {
    id: "redis",
    displayName: "Redis",
    category: "database",
    detectionPatterns: {
      envVarNames: ["REDIS_URL", "REDIS_HOST", "REDIS_PASSWORD", "REDIS_CONNECTION_STRING"],
      importPatterns: ["import redis", "from redis", "ioredis", "Redis\\(url="],
      packageNames: ["redis", "ioredis"],
      endpointPatterns: [],
    },
    changelogConfig: {
      changelogUrl: "https://raw.githubusercontent.com/redis/redis-doc/master/docs/releases/",
      releaseNotesUrl: "https://raw.githubusercontent.com/redis/redis-doc/master/docs/releases/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 42. Plaid
  // -------------------------------------------------------------------------
  {
    id: "plaid",
    displayName: "Plaid",
    category: "payment",
    detectionPatterns: {
      envVarNames: ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV", "PLAID_PUBLIC_KEY"],
      importPatterns: ["import plaid", "from plaid", "PlaidApi"],
      packageNames: ["plaid"],
      endpointPatterns: [],
    },
    changelogConfig: {
      changelogUrl: "https://plaid.com/changelog/",
      releaseNotesUrl: "https://plaid.com/changelog/",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 43. OpenWeather
  // -------------------------------------------------------------------------
  {
    id: "openweather",
    displayName: "OpenWeather",
    category: "other",
    detectionPatterns: {
      envVarNames: ["OPENWEATHER_API_KEY", "OPENWEATHER_APPID"],
      importPatterns: ["import pyowm", "from pyowm", "import openweather", "openweather-apis"],
      packageNames: ["pyowm", "openweather-apis"],
      endpointPatterns: ["api\\.openweathermap\\.org"],
    },
    changelogConfig: {
      changelogUrl: "https://openweathermap.org/changelog",
      releaseNotesUrl: "https://openweathermap.org/changelog",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },

  // -------------------------------------------------------------------------
  // Phase D — 44. SerpApi
  // -------------------------------------------------------------------------
  {
    id: "serpapi",
    displayName: "SerpApi",
    category: "other",
    detectionPatterns: {
      envVarNames: ["SERPAPI_API_KEY", "SERP_API_KEY"],
      importPatterns: ["import serpapi", "from serpapi", "from google_search_results", "SerpApiClient"],
      packageNames: ["serpapi", "google-search-results"],
      endpointPatterns: ["serpapi\\.com"],
    },
    changelogConfig: {
      changelogUrl: "https://serpapi.com/changelog",
      releaseNotesUrl: "https://serpapi.com/changelog",
      pollingFrequency: "weekly",
    },
    monitoringStatus: "supported",
    detectionEnabled: true,
  },
] as const;

// ---------------------------------------------------------------------------
// Registry lookup helpers
// ---------------------------------------------------------------------------

/** Map of provider ID → provider entry for O(1) lookups */
export const PROVIDER_MAP: Map<string, ProviderEntry> = new Map(
  PROVIDER_REGISTRY.map((p) => [p.id, p])
);

/** Get a provider by ID */
export function getProvider(id: string): ProviderEntry | undefined {
  return PROVIDER_MAP.get(id);
}

/** Get all provider IDs */
export function getAllProviderIds(): string[] {
  return PROVIDER_REGISTRY.map((p) => p.id);
}

/** Get providers by category */
export function getProvidersByCategory(category: ProviderCategory): ProviderEntry[] {
  return PROVIDER_REGISTRY.filter((p) => p.category === category);
}

/** Get all env var names across all providers */
export function getAllEnvVarNames(): string[] {
  return PROVIDER_REGISTRY.flatMap((p) => p.detectionPatterns.envVarNames);
}

/** Get all package names across all providers */
export function getAllPackageNames(): string[] {
  return PROVIDER_REGISTRY.flatMap((p) => p.detectionPatterns.packageNames);
}

// Re-export types
export type { ProviderEntry, ProviderCategory, MonitoringStatus, DetectionPatterns, ChangelogConfig } from "./types";
