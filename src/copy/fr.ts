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
    privacyLink: "Données personnelles",
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
    amphiLink: "Mode amphi (projection)",
    upcomingNotice: "Le bulletin ouvrira à la date d’ouverture indiquée ci-dessous.",
    argumentsTitle: "Arguments",
    argumentPourTab: "Pour",
    argumentContreTab: "Contre",
    argumentContreEmpty:
      "Aucun argument contre n’a été déposé pendant la collecte.",
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
      openAmphiPage: "Mode amphi",
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
    filters: {
      all: "Toutes",
      vote: "Scrutins",
      petition: "Pétitions",
    },
    countLabel: (count: number) =>
      count <= 1 ? `${count} entrée` : `${count} entrées`,
    draftLabel: (shortId: string) => `Brouillon de scrutin (${shortId})`,
    cancelledPrefix: "Scrutin annulé :",
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
      "petition.auto_approve": "Publication automatique (48 h)",
      "petition.request_changes": "Demande de reformulation",
      "petition.reject": "Rejet d’une pétition",
    },
  },
  petitions: {
    proposeTitle: "Proposer une question",
    listTitle: "Pétitions",
    tabPropose: "Déposer une pétition",
    tabList: "Pétitions en cours",
    views: {
      collecting: "En collecte",
      in_review: "En relecture",
    },
    states: {
      collecting: "En collecte",
      in_review: "En relecture",
      changes_requested: "Reformulation demandée",
      approved: "Approuvée · vote publié",
      rejected: "Rejetée",
      expired: "Expirée",
    },
    empty: {
      collecting: "Aucune pétition en collecte pour le moment.",
      in_review: "Aucune pétition en attente de relecture.",
    },
    countLabel: (count: number) =>
      count <= 1 ? `${count} pétition` : `${count} pétitions`,
    signaturesProgress: (count: string, threshold: string) =>
      `${count} / ${threshold} signatures`,
    collectEndsIn: (remaining: string) => `Fin de collecte dans ${remaining}`,
    reviewEndsAt: (date: string) => `Publication auto au plus tard le ${date}`,
    steps: ["Question", "Options", "Arguments", "Durée"] as const,
    charterTitle: "Charte de formulation",
    charterRules: [
      "Elle pose une seule question.",
      "Elle ne contient ni adjectif de valeur ni sous-entendu.",
      "Elle nomme une action concrète, son périmètre et ses dates quand il y en a.",
      "Ses options sont mutuellement exclusives.",
    ] as const,
    charterBadExample:
      "Face à la casse de l’université, faut-il sauver nos conditions d’étude ?",
    charterGoodExample:
      "Bloquer le campus Peixotto du 30 nov. au 4 déc. ?",
    agCheckbox: "C’est une décision d’AG",
    agDateLabel: "Date de l’AG",
    agLocationLabel: "Lieu (ex. amphi A)",
    agAttendeesLabel: "Nombre de présents",
    agResultLabel: "Résultat du vote à main levée",
    durationLabel: "Durée souhaitée du vote (heures, 24 h à 14 jours)",
    durationPresets: [
      { hours: 24, label: "24 h" },
      { hours: 72, label: "72 h (par défaut)" },
      { hours: 168, label: "7 jours" },
      { hours: 336, label: "14 jours" },
    ] as const,
    submitPetition: "Déposer la pétition",
    submittingPetition: "Dépôt en cours…",
    signCta: "Signer cette pétition",
    signingCta: "Signature…",
    alreadySignedLabel: "Tu as déjà signé cette pétition.",
    loginToSign: "Connecte-toi pour signer ou déposer un argument.",
    seePublishedVote: "Voir le vote publié",
    rewordingTitle: "Reformulation demandée (charte)",
    acceptRewording: "Accepter la reformulation",
    refuseRewording: "Refuser et maintenir ma question",
    contreSectionTitle: "Arguments « Contre »",
    contreIntro:
      "Tout étudiant peut proposer un texte Contre et soutenir une seule proposition. La plus soutenue figurera sur la page du vote.",
    contreEmpty: "Aucun argument contre n’a été déposé pour le moment.",
    contreTextLabel: "Ton argument Contre (600 caractères max.)",
    contreAuthorLabel: "Signature libre (ex. « Anonyme », « Étudiants L2 »)",
    contreSubmit: "Déposer cet argument Contre",
    supportAction: "Soutenir",
    supportedAction: "Soutenu",
    supportsCount: (count: number) =>
      count <= 1 ? `${count} soutien` : `${count} soutiens`,
    adminQueueTitle: "File de relecture des pétitions",
    adminQueueEmpty: "Aucune pétition en attente de relecture.",
    adminApprove: "Approuver et publier le vote",
    adminRequestChanges: "Demander une reformulation",
    adminReject: "Rejeter",
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
    privacyLink: "Données personnelles",
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
  amphi: {
    modeLabel: "Mode amphi · Projection",
    backToVote: "Page du scrutin",
    participationLabel: "Participation",
    countdownOpenLabel: "Clôture dans",
    countdownUpcomingLabel: "Ouverture dans",
    closedHeadline: "Scrutin clos",
    closedNotice: "Le scrutin est arrivé à échéance. Les résultats sont publiés.",
    seeResultsCta: "Afficher les résultats",
    votersCountLabel: (electorate: string, pct: string) =>
      `votants sur ${electorate} inscrits · ${pct}`,
    noPartialResultsNotice:
      "Résultats invisibles jusqu’à l’échéance. Seule la participation totale est affichée.",
    refreshNote: "Mise à jour automatique toutes les 10 s",
    lastUpdated: (time: string) => `Dernière actualisation : ${time}`,
    scanTitle: "Voter depuis ton téléphone",
    scanInstruction:
      "Scanne le QR code ou ouvre l’adresse ci-dessous avec ton adresse @etu.u-bordeaux.fr.",
    qrAlt: (question: string) => `QR code vers le scrutin : ${question}`,
    deadlineLabel: (date: string) => `Échéance : ${date}`,
    opensLabel: (date: string) => `Ouverture : ${date}`,
    keyLabel: "Empreinte de la clé",
  },
  howItWorks: {
    title: "Comment ça marche",
    intro:
      "Quorum sépare ton identité de ton bulletin grâce aux signatures aveugles RSA (RFC 9474, variante RSABSSA-SHA384-PSS-Randomized).",
    analogyTitle: "L’analogie du ticket tamponné sans être lu",
    analogyLead:
      "Imagine un bureau de vote où l’on vérifie ta carte étudiante pour te tamponner un ticket de vote — mais dans une enveloppe opaque, sans jamais voir le numéro du ticket.",
    steps: [
      {
        number: "01",
        title: "Ton téléphone prépare un ticket masqué",
        body: "Quand tu ouvres un scrutin ouvert, ton navigateur fabrique un numéro aléatoire unique et le glisse dans une « enveloppe opaque » cryptographique (masquage aveugle).",
      },
      {
        number: "02",
        title: "Le serveur tamponne à l’aveugle et émarge",
        body: "Le serveur vérifie que ton compte étudiant n’a pas encore retiré de jeton pour ce scrutin. Il applique la signature privée du scrutin sur l’enveloppe sans voir le numéro, et note que tu as émargé.",
      },
      {
        number: "03",
        title: "Ton bulletin part sans cookie ni identifiant",
        body: "Ton navigateur retire l’enveloppe pour obtenir un ticket valablement signé, attend un court délai aléatoire (0,5 à 3 s), puis envoie le ticket et ton choix sans aucun cookie ni session. Le serveur vérifie le tampon et glisse le bulletin dans l’urne sans savoir qui tu es.",
      },
      {
        number: "04",
        title: "Revote libre et reçu vérifiable",
        body: "Jusqu’à l’échéance, tu peux modifier ton vote (jusqu’à 20 fois) : seul ton dernier bulletin compte, et ton choix n’est jamais conservé sur ton appareil. À la clôture, la liste publique des reçus (XX-XXXX-XXX, sans les choix) permet à chacun de vérifier que son bulletin a été compté.",
      },
    ] as const,
    storageTitle: "Ce qui est stocké, et ce qui ne l’est pas",
    neverStoredTitle: "Jamais stocké",
    neverStoredItems: [
      "Ton adresse email en clair (ni en base, ni dans les logs, ni dans les erreurs).",
      "Ton adresse IP (utilisée uniquement en mémoire avec un sel quotidien pour le rate limiting, 15 min max).",
      "Ton choix sur ton appareil : seul le jeton anonyme et ton reçu sont gardés dans le navigateur.",
      "Aucun lien entre ton identité et ton bulletin, et aucune date ni heure sur la table des bulletins.",
      "Aucun décompte partiel avant l’échéance, même pour l’administration.",
    ] as const,
    storedTempTitle: "Stocké temporairement puis effacé",
    storedTempItems: [
      "Ton pseudonyme cryptographique (HMAC de ton email) pour empêcher les doubles comptes, purgé en fin d’année universitaire.",
      "Le registre d’émargement d’un scrutin (qui prouve qu’un jeton a été retiré, sans lien avec l’urne), supprimé et purgé à la clôture.",
      "La clé privée propre à chaque scrutin, stockée chiffrée (AES-256-GCM) puis définitivement effacée à la clôture.",
    ] as const,
    publicAtCloseTitle: "Rendu public à la clôture",
    publicAtCloseItems: [
      "Le résultat par option (pourcentages sur les suffrages exprimés, votes blancs à part) et la participation.",
      "Le contrôle public : nombre de bulletins déposés inférieur ou égal au nombre de jetons émis.",
      "La liste triée des reçus (sans les choix), son empreinte SHA-256 et le procès-verbal PDF.",
    ] as const,
    lostDeviceTitle: "En cas de perte de l’appareil ou de vidage du navigateur",
    lostDeviceBody:
      "Ton jeton anonyme est stocké uniquement dans le navigateur qui a ouvert le scrutin (IndexedDB). Si tu perds ton téléphone, changes de navigateur ou effaces les données du site après l’émission du jeton, tu ne pourras plus voter ni modifier ton choix sur ce scrutin : délivrer un second jeton permettrait de voter deux fois.",
    guaranteesTitle: "Ce que le protocole garantit — et ce qu’il ne garantit pas en V1",
    guaranteesColYes: "Garanti",
    guaranteesColNo: "Non garanti en V1",
    guaranteesRows: [
      {
        yes: "Aucune table ne relie une identité à un bulletin.",
        no: "Un opérateur malveillant qui observe le trafic réseau en direct pourrait rapprocher deux requêtes dans le temps.",
      },
      {
        yes: "Une fuite de la base ne révèle aucun choix nominatif.",
        no: "Un administrateur disposant d’un accès direct à la base pourrait lire les bulletins avant l’échéance (pas de chiffrement des bulletins en V1).",
      },
      {
        yes: "Un seul jeton anonyme par étudiant et par scrutin.",
        no: "Le dépouillement n’est pas recalculable par un tiers bulletin par bulletin.",
      },
      {
        yes: "Bourrage détectable : bulletins toujours inférieurs ou égaux aux jetons émis.",
        no: "Quelqu’un ayant accès à ta boîte mail universitaire pourrait voter à ta place.",
      },
    ] as const,
    transparencyTitle: "Transparence et contrôle",
    transparencyBody:
      "Un vote publié est immuable : question, options, arguments, dates et clé ne peuvent plus être modifiés. Toute action d’administration est consignée dans le journal public.",
    journalLink: "Consulter le journal public d’administration",
    privacyLink: "Données personnelles (RGPD)",
    backHome: "Retour à l’accueil",
    backVotes: "Retour aux votes",
  },
  privacy: {
    title: "Données personnelles",
    intro:
      "Quorum applique la minimisation des données dès la conception : l’adresse universitaire ne sert qu’à vérifier ton appartenance à l’université et à éviter les doubles votes.",
    controllerTitle: "Responsable de traitement",
    controllerBody:
      "Projet pilote Quorum — Université de Bordeaux. La structure porteuse définitive (association loi 1901) et son nom de domaine officiel seront renseignés ici avant toute ouverture publique générale.",
    purposeTitle: "Finalités et données sensibles",
    purposeBody:
      "Quorum permet d’organiser des consultations étudiantes anonymes et des pétitions sur la vie de campus. Parce que certaines questions peuvent révéler des opinions politiques ou syndicales, aucun lien technique n’est conservé entre ton identité et ton bulletin de vote (signatures aveugles RFC 9474).",
    tableTitle: "Catégories de données et durées de conservation",
    columns: {
      data: "Donnée",
      nature: "Nature",
      retention: "Conservation",
    },
    rows: [
      {
        data: "Adresse email",
        nature:
          "Transitoire en mémoire. Transmise au prestataire d’email pour l’envoi du code à 6 chiffres.",
        retention: "Jamais stockée en base ; politique minimale côté prestataire.",
      },
      {
        data: "Identifiant de votant (voters.id)",
        nature: "Pseudonyme (HMAC-SHA256 de l’email normalisé).",
        retention: "Jusqu’au 31 août de l’année universitaire.",
      },
      {
        data: "Sessions",
        nature: "Pseudonyme (empreinte SHA-256 du jeton de session).",
        retention: "30 jours (ou jusqu’à la déconnexion).",
      },
      {
        data: "Émargement",
        nature: "Pseudonyme attestant le retrait d’un jeton pour un scrutin.",
        retention: "Supprimé et purgé dès la clôture du scrutin.",
      },
      {
        data: "Bulletins",
        nature: "Anonymes, sans lien avec une identité ni horodatage.",
        retention: "Conservés pour le procès-verbal public.",
      },
      {
        data: "Signatures, soutiens et auteur de pétition",
        nature: "Pseudonymes (HMAC).",
        retention: "30 jours après la fin de la pétition.",
      },
      {
        data: "Textes « Pour » et « Contre »",
        nature: "Publiés avec une signature libre choisie par l’auteur.",
        retention: "Durée de vie du scrutin.",
      },
    ] as const,
    hostingTitle: "Hébergement, cookies et absence de traceurs",
    hostingBody:
      "Les données sont hébergées en Union européenne (Scaleway, région fr-par). Quorum n’intègre aucun outil de mesure d’audience, aucune publicité, aucun script ni police tiers, et aucun pixel dans les emails. Un seul cookie technique strictement nécessaire à la connexion (__Host-quorum_session) est déposé.",
    rightsTitle: "Tes droits",
    rightsBody:
      "Conformément au RGPD, tu disposes d’un droit d’accès, de rectification, d’effacement, de limitation et d’opposition, ainsi que du droit d’introduire une réclamation auprès de la CNIL (cnil.fr). Les bulletins étant cryptographiquement anonymes, il est techniquement impossible d’identifier ou de supprimer un bulletin individuel après son dépôt.",
    contactTitle: "Contact",
    contactBody:
      "Pour toute question relative à tes données personnelles ou pour exercer tes droits, écris à :",
    contactAddress: "donnees-personnelles@quorum-bordeaux.fr",
    howItWorksLink: "Comment l’anonymat est garanti",
    journalLink: "Journal public d’administration",
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
    active_petition_exists:
      "Tu as déjà une pétition active. Attends qu’elle aboutisse ou expire avant d’en déposer une autre.",
    monthly_petition_limit:
      "Tu as atteint la limite de 3 pétitions déposées ce mois-ci.",
    petition_not_collecting:
      "Cette pétition n’est plus ouverte aux signatures.",
    invalid_state: "Cette action n’est pas possible dans l’état actuel de la pétition.",
    invalid_opens_at:
      "La date d’ouverture doit être fixée au plus tard 24 heures après l’approbation.",
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
