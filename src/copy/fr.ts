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
    devCodeNotice: (code: string) =>
      `Mode dev local (MAIL_DRIVER=console) — code : ${code}`,
    devCodeFill: "Remplir",
    logoutAction: "Se déconnecter",
    logoutPending: "Déconnexion…",
  },
  votes: {
    title: "Votes",
    views: {
      open: "Ouverts",
      upcoming: "Bientôt",
      closed: "Clos",
    },
    status: {
      open: "Ouvert",
      upcoming: "Bientôt",
      closed: "Clos",
    },
    empty: {
      open: "Aucun vote n’est ouvert en ce moment.",
      upcoming: "Aucun vote n’est programmé pour le moment.",
      closed: "Aucun vote clos pour le moment.",
    },
    countLabel: (count: number) =>
      count <= 1 ? `${count} scrutin` : `${count} scrutins`,
    closesIn: (remaining: string) => `Ferme dans ${remaining}`,
    opensAt: (formatted: string) => `Ouvre le ${formatted}`,
    closedAt: (formatted: string) => `Clos le ${formatted}`,
    participationSummary: (ballots: string, electorate: string, pct: string) =>
      `${ballots} votants sur ${electorate} inscrits · ${pct}`,
    readQuestion: "Voir la question",
    seeResults: "Voir les résultats",
    backToVotes: "Retour aux votes",
    voteCta: "Voter",
    upcomingNotice: "Le bulletin ouvrira à la date d’ouverture indiquée ci-dessous.",
    argumentsTitle: "Arguments",
    argumentPourTab: "Pour",
    argumentContreTab: "Contre",
    argumentContreEmpty: "Aucun argument contre n’a été déposé.",
    signedBy: (author: string) => `Signé : ${author}`,
    factsTitle: "Ce que ça change concrètement",
    optionsTitle: "Options proposées",
    rulesTitle: "Règles du vote",
    rules: {
      whoLabel: "Qui vote",
      whoValue: "Étudiants de l’université",
      opensLabel: "Ouverture",
      closesLabel: "Échéance",
      resultLabel: "Résultat",
      resultValue:
        "Majorité des suffrages exprimés, blancs comptés à part, sans quorum",
      statusLabel: "Statut",
      keyLabel: "Empreinte de la clé",
    },
  },
  admin: {
    title: "Administration",
    forbidden: "Accès réservé à l’administration.",
    createSection: "Nouveau brouillon",
    listSection: "Scrutins",
    emptyList: "Aucun scrutin créé pour le moment.",
    journalLink: "Voir le journal public",
    states: {
      draft: "Brouillon",
      published: "Publié",
      cancelled: "Annulé",
    },
    fields: {
      question: "Question (140 caractères max.)",
      options: "Options (2 à 4, « Vote blanc » ajouté automatiquement)",
      addOption: "Ajouter une option",
      removeOption: "Retirer",
      statusNote: "Statut du résultat (ex. Consultatif — engagement du bureau)",
      originDetail: "Origine (facultatif)",
      argumentPour: "Argument Pour (600 caractères max.)",
      argumentPourAuthor: "Signature de l’argument Pour",
      argumentContre: "Argument Contre (facultatif, 600 caractères max.)",
      argumentContreAuthor: "Signature de l’argument Contre (facultatif)",
      facts: "Ce que ça change concrètement (faits sourcés, facultatif)",
      durationHours: "Durée du vote à la publication (heures, 24 à 336)",
      opensAtOptional: "Ouverture programmée (facultatif, vide = immédiate)",
      cancelReason: "Motif public d’annulation",
    },
    actions: {
      createDraft: "Enregistrer le brouillon",
      creating: "Enregistrement…",
      editDraft: "Modifier",
      saveDraft: "Enregistrer les modifications",
      cancelEdit: "Annuler la modification",
      publish: "Publier le scrutin",
      publishing: "Publication…",
      cancelVote: "Annuler ce scrutin",
      cancelling: "Annulation…",
      openPublicPage: "Voir la page publique",
    },
    feedback: {
      created: "Brouillon enregistré et journalisé.",
      updated: "Brouillon mis à jour et journalisé.",
      published: "Scrutin publié : clé RSA générée et règles figées.",
      cancelled: "Scrutin annulé : bulletins supprimés et motif publié au journal.",
    },
  },
  journal: {
    title: "Journal d’administration",
    intro:
      "Chaque action d’administration est enregistrée publiquement et ne peut pas être dissimulée.",
    empty: "Aucune action enregistrée pour le moment.",
    columns: {
      date: "Date (Paris)",
      action: "Action",
      target: "Objet",
      reason: "Motif",
    },
    actions: {
      "vote.create": "Création d’un brouillon",
      "vote.update": "Modification d’un brouillon",
      "vote.publish": "Publication d’un scrutin",
      "vote.cancel": "Annulation d’un scrutin",
      "petition.approve": "Approbation d’une pétition",
      "petition.request_changes": "Demande de reformulation",
      "petition.reject": "Rejet d’une pétition",
    },
  },
  me: {
    title: "Moi",
    connectedLabel: "Statut",
    connectedValue: "Connecté avec ton compte étudiant",
    adminRoleNote: "Accès administration actif sur cette session.",
    adminLink: "Ouvrir l’administration",
    receiptsTitle: "Mes reçus",
    receiptCodeLabel: "Reçu de vérification (ton choix n’est jamais stocké)",
    receiptsEmpty: "Aucun reçu enregistré sur cet appareil pour le moment.",
    howItWorksLink: "Comment ça marche",
    journalLink: "Journal d’administration",
  },
  ballot: {
    backToQuestion: "Retour à la question",
    stepChoose: "Bulletin · Choix",
    stepConfirm: "Bulletin · Confirmation",
    preparingToken: "Préparation de ton jeton anonyme…",
    chooseHint: "Choisis une option. Tu pourras modifier ton vote jusqu’à l’échéance.",
    revoteHint:
      "Nouveau vote : ton choix précédent n’est jamais conservé sur ton appareil. Seul ton dernier bulletin comptera.",
    continueCta: "Continuer",
    selectedLabel: "Ton choix",
    confirmPrivacyNote:
      "Ton bulletin est envoyé sans cookie ni identifiant. Ton choix n’est jamais enregistré sur cet appareil.",
    confirmCta: "Confirmer mon vote",
    submittingCta: "Envoi anonyme…",
    changeChoice: "Modifier mon choix",
    loginLink: "Me connecter",
    tokenLostTitle: "Jeton déjà émis sur un autre appareil",
    tokenLostBody:
      "Un jeton anonyme a déjà été émis pour ton compte sur ce scrutin, mais il n’est plus présent dans ce navigateur. Pour empêcher tout double vote, un second jeton ne peut pas être délivré.",
  },
  voted: {
    heading: "A voté.",
    receiptLabel: "Ton reçu",
    copyReceipt: "Copier",
    copied: "Copié",
    receiptUnavailable:
      "Reçu introuvable sur cet appareil. Il est conservé uniquement dans le navigateur utilisé pour voter.",
    receiptExplanation:
      "À la clôture, la liste publique des reçus (sans les choix) te permettra de vérifier que ton bulletin a bien été compté, sans que personne ne puisse connaître ton vote.",
    closesAtNotice: (date: string) => `Résultats publics à l’échéance : ${date}`,
    revoteLink: "Modifier mon vote",
  },
  results: {
    pageLabel: "Résultats",
    deadlineLabel: (date: string) => `Échéance : ${date}`,
    participationOf: "de participation",
    winnerSummary: (label: string, pct: string) =>
      `${label} l’emporte avec ${pct} des suffrages exprimés.`,
    expressedTotal: (count: string) =>
      `${count} suffrages exprimés (hors votes blancs)`,
    votesCount: (count: string) =>
      count === "1" ? `${count} voix` : `${count} voix`,
    blankLabel: "Vote blanc (compté à part)",
    blankCount: (count: string) =>
      count === "1" ? `${count} bulletin` : `${count} bulletins`,
    integritySection: "Contrôle public et vérification",
    ballotsAndTokens: (ballots: string, tokens: string) =>
      `Bulletins : ${ballots} · Jetons émis : ${tokens}`,
    integrityOk: "Contrôle conforme : bulletins inférieurs ou égaux aux jetons émis.",
    integrityAlert: "Anomalie détectée : le nombre de bulletins dépasse les jetons émis.",
    keyFingerprintLabel: "Empreinte de la clé du scrutin (SHA-256)",
    receiptsHashLabel: "Empreinte de la liste des reçus (SHA-256)",
    receiptsListLink: "Liste des reçus",
    downloadPvLink: "Télécharger le procès-verbal (PDF)",
    backToQuestionLink: "Relire la question et les arguments",
    statusPrefix: "Statut :",
  },
  receipts: {
    title: "Liste publique des reçus",
    backToResults: "Retour aux résultats",
    intro:
      "Chaque reçu correspond à un bulletin compté dans l’urne, trié par ordre alphabétique sans aucun lien avec les choix.",
    searchLabel: "Vérifier un reçu (format XX-XXXX-XXX)",
    searchPlaceholder: "Ex. 7K-M4P2-9X1",
    myReceiptFound: (receipt: string) =>
      `Ton reçu (${receipt}) figure bien dans la liste publique des bulletins comptés.`,
    myReceiptMissing: (receipt: string) =>
      `Ton reçu (${receipt}) n’apparaît pas dans la liste publique.`,
    emptyList: "Aucun bulletin n’a été déposé pour ce scrutin.",
    noMatch: "Aucun reçu ne correspond à cette recherche.",
    countLabel: (count: number) =>
      count <= 1 ? `${count} reçu` : `${count} reçus`,
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
    vote_immutable: "Un scrutin publié est immuable et ne peut plus être modifié.",
    invalid_duration: "La durée du vote doit être comprise entre 24 h et 14 jours.",
    invalid_options:
      "Le scrutin doit contenir entre 2 et 4 options, plus le vote blanc.",
    vote_not_cancellable: "Ce scrutin ne peut pas être annulé dans son état actuel.",
    vote_already_closed: "Un scrutin clos ne peut plus être annulé.",
    vote_closed: "Ce scrutin n’est plus ouvert au vote.",
    vote_not_closed: "Les résultats ne sont disponibles qu’après l’échéance du scrutin.",
    invalid_blinded_msg: "Requête de jeton invalide.",
    token_already_issued:
      "Un jeton a déjà été délivré pour ce scrutin sur un autre appareil.",
    invalid_token: "Jeton de vote invalide pour ce scrutin.",
    invalid_signature: "Signature du jeton invalide.",
    invalid_option: "L’option choisie n’appartient pas à ce scrutin.",
    max_revisions_reached:
      "Tu as atteint la limite de 20 modifications pour ce scrutin.",
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
