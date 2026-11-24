export const copy = {
  app: {
    name: "quorum",
    title: "Quorum",
    tagline:
      "Les votes de ton université. Une voix par étudiant inscrit, vote anonyme, résultats publics à la clôture.",
    institution: "Université de Bordeaux",
  },
  nav: {
    votes: "Votes",
    propose: "Proposer",
    me: "Moi",
  },
  auth: {
    startCta: "Recevoir un code",
    anonymityLink: "Comment l’anonymat est garanti",
    backLabel: "Retour",
    emailTitle: "Entre ton adresse étudiante",
    emailLabel: "Adresse universitaire",
    emailPlaceholder: "prenom.nom@etu.u-bordeaux.fr",
    emailHelp:
      "Uniquement @etu.u-bordeaux.fr, sans alias (+). Ton adresse n’est jamais enregistrée en clair.",
    emailSubmit: "Envoyer le code",
    emailSubmitting: "Envoi en cours…",
    codeTitle: "Entre le code reçu par email",
    codeSentNotice: "Si l’adresse est valide, un code vient d’être envoyé.",
    codeGroupLabel: "Code à 6 chiffres",
    codeDigitLabel: (index: number) => `Chiffre ${index} sur 6`,
    codeSubmit: "Se connecter",
    codeSubmitting: "Vérification…",
    resendCountdown: (seconds: number) => `Renvoyer un code dans ${seconds} s`,
    resendAction: "Renvoyer un code",
    resendSuccess: "Un nouveau code vient d’être envoyé si l’adresse est valide.",
    changeEmailAction: "Changer d’adresse",
    logoutAction: "Se déconnecter",
    logoutPending: "Déconnexion…",
  },
  votes: {
    title: "Votes",
    emptySoon:
      "La liste des votes et leur administration arrivent au jalon suivant (J2).",
  },
  me: {
    title: "Moi",
    connectedLabel: "Statut",
    connectedValue: "Connecté avec ton compte étudiant",
    adminRoleNote: "Accès administration actif sur cette session.",
    receiptsTitle: "Mes reçus",
    receiptsEmpty:
      "Tes reçus de vote s’afficheront ici dès que tu auras participé à un scrutin (J3).",
    howItWorksLink: "Comment ça marche",
  },
  howItWorks: {
    title: "Comment l’anonymat est garanti",
    intro:
      "Quorum sépare complètement ton identité de ton bulletin grâce aux signatures aveugles (RFC 9474).",
    summary:
      "Ton adresse @etu.u-bordeaux.fr sert uniquement à vérifier que tu es étudiant et à t’émettre un jeton anonyme par scrutin. Ton adresse n’est jamais stockée en clair, et le bulletin déposé ne contient aucun cookie ni identifiant.",
    backHome: "Retour à l’accueil",
  },
  errors: {
    internal_error: "Une erreur interne est survenue. Réessaie dans un instant.",
    invalid_request: "Les données envoyées ne sont pas valides.",
    invalid_email:
      "Utilise une adresse @etu.u-bordeaux.fr valide, sans signe « + ».",
    invalid_code:
      "Ce code est invalide ou expiré. Vérifie les 6 chiffres ou demande un nouveau code.",
    unauthorized: "Tu dois te connecter pour effectuer cette action.",
    forbidden: "Tu n’as pas les droits nécessaires pour cette action.",
    not_found: "Cette ressource est introuvable.",
    rate_limited:
      "Trop de demandes. Patiente quelques minutes avant de réessayer.",
    network_error:
      "Impossible de joindre le serveur. Vérifie ta connexion et réessaie.",
  },
} as const;

export type ErrorCode = keyof typeof copy.errors;

export function getErrorMessage(code: string | undefined): string {
  if (code && code in copy.errors) {
    return copy.errors[code as ErrorCode];
  }
  return copy.errors.internal_error;
}
