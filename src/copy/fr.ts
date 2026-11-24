export const copy = {
  app: {
    name: "Quorum",
    tagline: "Vote étudiant anonyme et vérifiable — Université de Bordeaux",
    institution: "Université de Bordeaux",
    socleNotice:
      "Socle technique en place. Les écrans de connexion et de vote arrivent aux prochains jalons.",
  },
  nav: {
    votes: "Votes",
    propose: "Proposer",
    me: "Moi",
  },
  errors: {
    internal_error: "Une erreur interne est survenue. Réessaie dans un instant.",
    invalid_request: "Les données envoyées ne sont pas valides.",
    unauthorized: "Tu dois te connecter pour effectuer cette action.",
    forbidden: "Tu n’as pas les droits nécessaires pour cette action.",
    not_found: "Cette ressource est introuvable.",
    rate_limited: "Trop de demandes. Patiente quelques minutes avant de réessayer.",
  },
} as const;

export type ErrorCode = keyof typeof copy.errors;
