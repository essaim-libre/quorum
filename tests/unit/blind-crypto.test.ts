import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  blindSignToken,
  blindToken,
  buildVoteTokenMessage,
  finalizeToken,
  hasValidVoteTokenPrefix,
  importVotePrivateKey,
  importVotePublicKey,
  prepareToken,
  verifyToken,
} from "@/lib/crypto/blind";
import { computeReceipt, formatCrockford45Bits } from "@/lib/crypto/receipt";
import {
  decryptVotePrivateKeyPkcs8,
  generateVoteKeyPair,
} from "@/lib/crypto/vote-keys";

// Vecteur officiel de la RFC 9474, annexe A.1 (RSABSSA-SHA384-PSS-Randomized)
const RFC9474_A1 = {
  p:
    "e1f4d7a34802e27c7392a3cea32a262a34dc3691bd87f3f310dc756734889305" +
    "59c120fd0410194fb8a0da55bd0b81227e843fdca6692ae80e5a5d414116d4803fca" +
    "7d8c30eaaae57e44a1816ebb5c5b0606c536246c7f11985d731684150b63c9a3ad9e" +
    "41b04c0b5b27cb188a692c84696b742a80d3cd00ab891f2457443dadfeba6d6daf10" +
    "8602be26d7071803c67105a5426838e6889d77e8474b29244cefaf418e381b312048" +
    "b457d73419213063c60ee7b0d81820165864fef93523c9635c22210956e53a8d9632" +
    "2493ffc58d845368e2416e078e5bcb5d2fd68ae6acfa54f9627c42e84a9d3f277401" +
    "7e32ebca06308a12ecc290c7cd1156dcccfb2311",
  q:
    "c601a9caea66dc3835827b539db9df6f6f5ae77244692780cd334a006ab353c8" +
    "06426b60718c05245650821d39445d3ab591ed10a7339f15d83fe13f6a3dfb20b945" +
    "2c6a9b42eaa62a68c970df3cadb2139f804ad8223d56108dfde30ba7d367e9b0a7a8" +
    "0c4fdba2fd9dde6661fc73fc2947569d2029f2870fc02d8325acf28c9afa19ecf962" +
    "daa7916e21afad09eb62fe9f1cf91b77dc879b7974b490d3ebd2e95426057f35d0a3" +
    "c9f45f79ac727ab81a519a8b9285932d9b2e5ccd347e59f3f32ad9ca359115e7da00" +
    "8ab7406707bd0e8e185a5ed8758b5ba266e8828f8d863ae133846304a2936ad7bc7c" +
    "9803879d2fc4a28e69291d73dbd799f8bc238385",
  n:
    "aec4d69addc70b990ea66a5e70603b6fee27aafebd08f2d94cbe1250c556e047" +
    "a928d635c3f45ee9b66d1bc628a03bac9b7c3f416fe20dabea8f3d7b4bbf7f963be3" +
    "35d2328d67e6c13ee4a8f955e05a3283720d3e1f139c38e43e0338ad058a9495c533" +
    "77fc35be64d208f89b4aa721bf7f7d3fef837be2a80e0f8adf0bcd1eec5bb040443a" +
    "2b2792fdca522a7472aed74f31a1ebe1eebc1f408660a0543dfe2a850f106a617ec6" +
    "685573702eaaa21a5640a5dcaf9b74e397fa3af18a2f1b7c03ba91a6336158de420d" +
    "63188ee143866ee415735d155b7c2d854d795b7bc236cffd71542df34234221a0413" +
    "e142d8c61355cc44d45bda94204974557ac2704cd8b593f035a5724b1adf442e78c5" +
    "42cd4414fce6f1298182fb6d8e53cef1adfd2e90e1e4deec52999bdc6c29144e8d52" +
    "a125232c8c6d75c706ea3cc06841c7bda33568c63a6c03817f722b50fcf898237d78" +
    "8a4400869e44d90a3020923dc646388abcc914315215fcd1bae11b1c751fd52443aa" +
    "c8f601087d8d42737c18a3fa11ecd4131ecae017ae0a14acfc4ef85b83c19fed33cf" +
    "d1cd629da2c4c09e222b398e18d822f77bb378dea3cb360b605e5aa58b20edc29d00" +
    "0a66bd177c682a17e7eb12a63ef7c2e4183e0d898f3d6bf567ba8ae84f84f1d23bf8" +
    "b8e261c3729e2fa6d07b832e07cddd1d14f55325c6f924267957121902dc19b3b329" +
    "48bdead5",
  e: "010001",
  d:
    "0d43242aefe1fb2c13fbc66e20b678c4336d20b1808c558b6e62ad16a2870771" +
    "80b177e1f01b12f9c6cd6c52630257ccef26a45135a990928773f3bd2fc01a313f1d" +
    "ac97a51cec71cb1fd7efc7adffdeb05f1fb04812c924ed7f4a8269925dad88bd7dcf" +
    "bc4ef01020ebfc60cb3e04c54f981fdbd273e69a8a58b8ceb7c2d83fbcbd6f784d05" +
    "2201b88a9848186f2a45c0d2826870733e6fd9aa46983e0a6e82e35ca20a439c5ee7" +
    "b502a9062e1066493bdadf8b49eb30d9558ed85abc7afb29b3c9bc644199654a4676" +
    "681af4babcea4e6f71fe4565c9c1b85d9985b84ec1abf1a820a9bbebee0df1398aae" +
    "2c85ab580a9f13e7743afd3108eb32100b870648fa6bc17e8abac4d3c99246b1f0ea" +
    "9f7f93a5dd5458c56d9f3f81ff2216b3c3680a13591673c43194d8e6fc93fc1e37ce" +
    "2986bd628ac48088bc723d8fbe293861ca7a9f4a73e9fa63b1b6d0074f5dea2a624c" +
    "5249ff3ad811b6255b299d6bc5451ba7477f19c5a0db690c3e6476398b1483d10314" +
    "afd38bbaf6e2fbdbcd62c3ca9797a420ca6034ec0a83360a3ee2adf4b9d4ba29731d" +
    "131b099a38d6a23cc463db754603211260e99d19affc902c915d7854554aabf608e3" +
    "ac52c19b8aa26ae042249b17b2d29669b5c859103ee53ef9bdc73ba3c6b537d5c34b" +
    "6d8f034671d7f3a8a6966cc4543df223565343154140fd7391c7e7be03e241f4ecfe" +
    "b877a051",
  prepared_msg:
    "8417e699b219d583fb6216ae0c53ca0e9723442d02f1d1a342955" +
    "27e7d929e8b8f3dc6fb8c4a02f4d6352edf0907822c1210a9b32f9bdda4c45a698c8" +
    "0023aa6b59f8cfec5fdbb36331372ebefedae7d",
  inv:
    "80682c48982407b489d53d1261b19ec8627d02b8cda5336750b8cee332ae26" +
    "0de57b02d72609c1e0e9f28e2040fc65b6f02d56dbd6aa9af8fde656f70495dfb723" +
    "ba01173d4707a12fddac628ca29f3e32340bd8f7ddb557cf819f6b01e445ad96f874" +
    "ba235584ee71f6581f62d4f43bf03f910f6510deb85e8ef06c7f09d9794a008be7ff" +
    "2529f0ebb69decef646387dc767b74939265fec0223aa6d84d2a8a1cc912d5ca25b4" +
    "e144ab8f6ba054b54910176d5737a2cff011da431bd5f2a0d2d66b9e70b39f4b050e" +
    "45c0d9c16f02deda9ddf2d00f3e4b01037d7029cd49c2d46a8e1fc2c0c17520af1f4" +
    "b5e25ba396afc4cd60c494a4c426448b35b49635b337cfb08e7c22a39b256dd032c0" +
    "0adddafb51a627f99a0e1704170ac1f1912e49d9db10ec04c19c58f420212973e0cb" +
    "329524223a6aa56c7937c5dffdb5d966b6cd4cbc26f3201dd25c80960a1a111b3294" +
    "7bb78973d269fac7f5186530930ed19f68507540eed9e1bab8b00f00d8ca09b3f099" +
    "aae46180e04e3584bd7ca054df18a1504b89d1d1675d0966c4ae1407be325cdf623c" +
    "f13ff13e4a28b594d59e3eadbadf6136eee7a59d6a444c9eb4e2198e8a974f27a39e" +
    "b63af2c9af3870488b8adaad444674f512133ad80b9220e09158521614f1faadfe85" +
    "05ef57b7df6813048603f0dd04f4280177a11380fbfc861dbcbd7418d62155248dad" +
    "5fdec0991f",
  blinded_msg:
    "aa3ee045138d874669685ffaef962c7694a9450aa9b4fd6465db9b" +
    "3b75a522bb921c4c0fdcdfae9667593255099cff51f5d3fd65e8ffb9d3b3036252a6" +
    "b51b6edfb3f40382b2bbf34c0055e4cbcc422850e586d84f190cd449af11dc65545f" +
    "5fe26fd89796eb87da4bda0c545f397cddfeeb56f06e28135ec74fd477949e7677f6" +
    "f36cfae8fd5c1c5898b03b9c244cf6d1a4fb7ad1cb43aff5e80cb462fac541e72f67" +
    "f0a50f1843d1759edfaae92d1a916d3f0efaf4d650db416c3bf8abdb5414a78cebc9" +
    "7de676723cb119e77aea489f2bbf530c440ebc5a75dccd3ebf5a412a5f346badd61b" +
    "ee588e5917bdcce9dc33c882e39826951b0b8276c6203971947072b726e935816056" +
    "ff5cb11a71ca2946478584126bb877acdf87255f26e6cca4e0878801307485d3b7bb" +
    "89b289551a8b65a7a6b93db010423d1406e149c87731910306e5e410b41d4da32346" +
    "24e74f92845183e323cf7eb244f212a695f8856c675fbc3a021ce649e22c6f0d053a" +
    "9d238841cf3afdc2739f99672a419ae13c17f1f8a3bc302ec2e7b98e8c353898b715" +
    "0ad8877ec841ea6e4b288064c254fefd0d049c3ad196bf7ffa535e74585d0120ce72" +
    "8036ed500942fbd5e6332c298f1ffebe9ff60c1e117b274cf0cb9d70c36ee4891528" +
    "996ec1ed0b178e9f3c0c0e6120885f39e8ccaadbb20f3196378c07b1ff22d10049d3" +
    "039a7a92fe7efdd95d",
  blind_sig:
    "3f4a79eacd4445fca628a310d41e12fcd813c4d43aa4ef2b81226953" +
    "248d6d00adfee6b79cb88bfa1f99270369fd063c023e5ed546719b0b2d143dd1bca4" +
    "6b0e0e615fe5c63d95c5a6b873b8b50bc52487354e69c3dfbf416e7aca18d5842c89" +
    "b676efdd38087008fa5a810161fcdec26f20ccf2f1e6ab0f9d2bb93e051cb9e86a9b" +
    "28c5bb62fd5f5391379f887c0f706a08bcc3b9e7506aaf02485d688198f5e22eefdf" +
    "837b2dd919320b17482c5cc54271b4ccb41d267629b3f844fd63750b01f5276c79e3" +
    "3718bb561a152acb2eb36d8be75bce05c9d1b94eb609106f38226fb2e0f5cd5c5c39" +
    "c59dda166862de498b8d92f6bcb41af433d65a2ac23da87f39764cb64e79e74a8f4c" +
    "e4dd567480d967cefac46b6e9c06434c3715635834357edd2ce6f105eea854ac126c" +
    "cfa3de2aac5607565a4e5efaac5eed491c335f6fc97e6eb7e9cea3e12de38dfb3152" +
    "20c0a3f84536abb2fdd722813e083feda010391ac3d8fd1cd9212b5d94e634e69ebc" +
    "c800c4d5c4c1091c64afc37acf563c7fc0a6e4c082bc55544f50a7971f3fb97d5853" +
    "d72c3af34ffd5ce123998be5360d1059820c66a81e1ee6d9c1803b5b62af6bc87752" +
    "6df255b6d1d835d8c840bebbcd6cc0ee910f17da37caf8488afbc08397a1941fcc79" +
    "e76a5888a95b3d5405e13f737bea5c78d716a48eb9dc0aec8de39c4b45c6914ad4a8" +
    "185969f70b1adf46",
  sig:
    "191e941c57510e22d29afad257de5ca436d2316221fe870c7cb75205a6c071" +
    "c2735aed0bc24c37f3d5bd960ab97a829a508f966bbaed7a82645e65eadaf24ab5e6" +
    "d9421392c5b15b7f9b640d34fec512846a3100b80f75ef51064602118c1a77d28d93" +
    "8f6efc22041d60159a518d3de7c4d840c9c68109672d743d299d8d2577ef60c19ab4" +
    "63c716b3fa75fa56f5735349d414a44df12bf0dd44aa3e10822a651ed4cb0eb6f47c" +
    "9bd0ef14a034a7ac2451e30434d513eb22e68b7587a8de9b4e63a059d05c8b22c7c5" +
    "1e2cfee2d8bef511412e93c859a13726d87c57d1bc4c2e68ab121562f839c3a3d233" +
    "e87ed63c69b7e57525367753fbebcc2a9805a2802659f5888b2c69115bf865559f10" +
    "d906c09d048a0d71bfee4b33857393ec2b69e451433496d02c9a7910abb954317720" +
    "bbde9e69108eafc3e90bad3d5ca4066d7b1e49013fa04e948104a1dd82b12509ecb1" +
    "46e948c54bd8bfb5e6d18127cd1f7a93c3cf9f2d869d5a78878c03fe808a0d799e91" +
    "0be6f26d18db61c485b303631d3568368fc41986d08a95ea6ac0592240c19d7b2241" +
    "6b9c82ae6241e211dd5610d0baaa9823158f9c32b66318f5529491b7eeadcaa71898" +
    "a63bac9d95f4aa548d5e97568d744fc429104e32edd9c87519892a198a30d333d427" +
    "739ffb9607b092e910ae37771abf2adb9f63bc058bf58062ad456cb934679795bbdf" +
    "cdfad5e0f2",
};

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function bigIntToBase64Url(value: bigint): string {
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  return Buffer.from(hex, "hex").toString("base64url");
}

function modInverse(a: bigint, m: bigint): bigint {
  let t = 0n;
  let newT = 1n;
  let r = m;
  let newR = ((a % m) + m) % m;
  while (newR !== 0n) {
    const q = r / newR;
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }
  return t < 0n ? t + m : t;
}

describe("wrapper signatures aveugles RFC 9474 (src/lib/crypto/blind.ts)", () => {
  it("passe le vecteur de test officiel RFC 9474 annexe A.1 (RSABSSA-SHA384-PSS-Randomized)", async () => {
    const n = BigInt(`0x${RFC9474_A1.n}`);
    const e = BigInt(`0x${RFC9474_A1.e}`);
    const d = BigInt(`0x${RFC9474_A1.d}`);
    const p = BigInt(`0x${RFC9474_A1.p}`);
    const q = BigInt(`0x${RFC9474_A1.q}`);

    const dp = d % (p - 1n);
    const dq = d % (q - 1n);
    const qi = modInverse(q, p);

    const jwkPrivate: JsonWebKey = {
      kty: "RSA",
      n: bigIntToBase64Url(n),
      e: bigIntToBase64Url(e),
      d: bigIntToBase64Url(d),
      p: bigIntToBase64Url(p),
      q: bigIntToBase64Url(q),
      dp: bigIntToBase64Url(dp),
      dq: bigIntToBase64Url(dq),
      qi: bigIntToBase64Url(qi),
      ext: true,
    };
    const jwkPublic: JsonWebKey = {
      kty: "RSA",
      n: jwkPrivate.n,
      e: jwkPrivate.e,
      ext: true,
    };

    const rawPrivate = await globalThis.crypto.subtle.importKey(
      "jwk",
      jwkPrivate,
      { name: "RSA-PSS", hash: "SHA-384" },
      true,
      ["sign"],
    );
    const rawPublic = await globalThis.crypto.subtle.importKey(
      "jwk",
      jwkPublic,
      { name: "RSA-PSS", hash: "SHA-384" },
      true,
      ["verify"],
    );

    // Passe par l'import SPKI/PKCS8 réel de notre wrapper
    const spki = new Uint8Array(
      await globalThis.crypto.subtle.exportKey("spki", rawPublic),
    );
    const pkcs8 = new Uint8Array(
      await globalThis.crypto.subtle.exportKey("pkcs8", rawPrivate),
    );
    const publicKey = await importVotePublicKey(spki);
    const privateKey = await importVotePrivateKey(pkcs8);

    const blindedMsg = hexToBytes(RFC9474_A1.blinded_msg);
    const expectedBlindSig = hexToBytes(RFC9474_A1.blind_sig);
    const preparedMsg = hexToBytes(RFC9474_A1.prepared_msg);
    const inv = hexToBytes(RFC9474_A1.inv);
    const expectedSig = hexToBytes(RFC9474_A1.sig);

    const blindSig = await blindSignToken(privateKey, blindedMsg);
    expect(Buffer.from(blindSig).toString("hex")).toBe(
      Buffer.from(expectedBlindSig).toString("hex"),
    );

    const finalSig = await finalizeToken(publicKey, preparedMsg, blindSig, inv);
    expect(Buffer.from(finalSig).toString("hex")).toBe(
      Buffer.from(expectedSig).toString("hex"),
    );

    expect(await verifyToken(publicKey, finalSig, preparedMsg)).toBe(true);
  });

  it("exécute un flux complet prepare → blind → blindSign → finalize → verify et rejette toute altération", async () => {
    const masterKey = randomBytes(32);
    const voteKey = generateVoteKeyPair(masterKey);
    const pkcs8 = decryptVotePrivateKeyPkcs8(voteKey.privateKeyEnc, masterKey);

    const publicKey = await importVotePublicKey(voteKey.publicKeySpki);
    const privateKey = await importVotePrivateKey(pkcs8);

    const voteA = randomUUID();
    const voteB = randomUUID();

    const msg = buildVoteTokenMessage(voteA);
    const inputMsg = prepareToken(msg);

    expect(hasValidVoteTokenPrefix(inputMsg, voteA)).toBe(true);
    expect(hasValidVoteTokenPrefix(inputMsg, voteB)).toBe(false);

    const { blindedMsg, inv } = await blindToken(publicKey, inputMsg);
    const blindSig = await blindSignToken(privateKey, blindedMsg);
    const sig = await finalizeToken(publicKey, inputMsg, blindSig, inv);

    expect(await verifyToken(publicKey, sig, inputMsg)).toBe(true);

    // Signature altérée refusée
    const corruptedSig = new Uint8Array(sig);
    corruptedSig[10] = (corruptedSig[10] ?? 0) ^ 0x01;
    expect(await verifyToken(publicKey, corruptedSig, inputMsg)).toBe(false);

    // Clé d'un autre vote refusée
    const otherKey = generateVoteKeyPair(masterKey);
    const otherPublicKey = await importVotePublicKey(otherKey.publicKeySpki);
    expect(await verifyToken(otherPublicKey, sig, inputMsg)).toBe(false);
  });
});

describe("calcul du reçu Crockford Base32 (§6.4, src/lib/crypto/receipt.ts)", () => {
  it("produit un reçu déterministe de 9 caractères au format XX-XXXX-XXX sans I/L/O/U", async () => {
    expect(formatCrockford45Bits(new Uint8Array([0, 0, 0, 0, 0, 0]))).toBe(
      "00-0000-000",
    );
    expect(
      formatCrockford45Bits(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xf8])),
    ).toBe("ZZ-ZZZZ-ZZZ");

    const input = new TextEncoder().encode("quorum-test-input-msg");
    const r1 = await computeReceipt(input);
    const r2 = await computeReceipt(input);

    expect(r1).toBe(r2);
    expect(r1).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{3}$/,
    );
    expect(r1).not.toMatch(/[ILOU]/);
  });
});
