/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* Copyright 2013 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include <limits>

#include "pkix/pkix.h"
#include "pkixcheck.h"
#include "pkixder.h"
#include "pkixutil.h"
#include "secder.h"

namespace mozilla { namespace pkix {

Result
CheckTimes(const CERTCertificate* cert, PRTime time)
{
  PR_ASSERT(cert);

  SECCertTimeValidity validity = CERT_CheckCertValidTimes(cert, time, false);
  if (validity != secCertTimeValid) {
    return Fail(RecoverableError, SEC_ERROR_EXPIRED_CERTIFICATE);
  }

  return Success;
}

// 4.2.1.3. Key Usage (id-ce-keyUsage)

// As explained in the comment in CheckKeyUsage, bit 0 is the most significant
// bit and bit 7 is the least significant bit.
inline uint8_t KeyUsageToBitMask(KeyUsage keyUsage)
{
  PR_ASSERT(keyUsage != KeyUsage::noParticularKeyUsageRequired);
  return 0x80u >> static_cast<uint8_t>(keyUsage);
}

Result
CheckKeyUsage(EndEntityOrCA endEntityOrCA, const SECItem* encodedKeyUsage,
              KeyUsage requiredKeyUsageIfPresent)
{
  if (!encodedKeyUsage) {
    // TODO(bug 970196): Reject certificates that are being used to verify
    // certificate signatures unless the certificate is a trust anchor, to
    // reduce the chances of an end-entity certificate being abused as a CA
    // certificate.
    // if (endEntityOrCA == EndEntityOrCA::MustBeCA && !isTrustAnchor) {
    //   return Fail(RecoverableError, SEC_ERROR_INADEQUATE_KEY_USAGE);
    // }
    //
    // TODO: Users may configure arbitrary certificates as trust anchors, not
    // just roots. We should only allow a certificate without a key usage to be
    // used as a CA when it is self-issued and self-signed.
    return Success;
  }

  der::Input input;
  if (input.Init(encodedKeyUsage->data, encodedKeyUsage->len) != der::Success) {
    return Fail(RecoverableError, SEC_ERROR_INADEQUATE_KEY_USAGE);
  }
  der::Input value;
  if (der::ExpectTagAndGetValue(input, der::BIT_STRING, value) != der::Success) {
    return Fail(RecoverableError, SEC_ERROR_INADEQUATE_KEY_USAGE);
  }

  uint8_t numberOfPaddingBits;
  if (value.Read(numberOfPaddingBits) != der::Success) {
    return Fail(RecoverableError, SEC_ERROR_INADEQUATE_KEY_USAGE);
  }
  if (numberOfPaddingBits > 7) {
    return Fail(RecoverableError, SEC_ERROR_INADEQUATE_KEY_USAGE);
  }

  uint8_t bits;
  if (value.Read(bits) != der::Success) {
    // Reject empty bit masks.
    return Fail(RecoverableError, SEC_ERROR_INADEQUATE_KEY_USAGE);
  }

  // The most significant bit is numbered 0 (digitalSignature) and the least
  // significant bit is numbered 7 (encipherOnly), and the padding is in the
  // least significant bits of the last byte. The numbering of bits in a byte
  // is backwards from how we usually interpret them.
  //
  // For example, let's say bits is encoded in one byte with of value 0xB0 and
  // numberOfPaddingBits == 4. Then, bits is 10110000 in binary:
  //
  //      bit 0  bit 3
  //          |  |
  //          v  v
  //          10110000
  //              ^^^^
  //               |
  //               4 padding bits
  //
  // Since bits is the last byte, we have to consider the padding by ensuring
  // that the least significant 4 bits are all zero, since DER rules require
  // all padding bits to be zero. Then we have to look at the bit N bits to the
  // right of the most significant bit, where N is a value from the KeyUsage
  // enumeration.
  //
  // Let's say we're interested in the keyCertSign (5) bit. We'd need to look
  // at bit 5, which is zero, so keyCertSign is not asserted. (Since we check
  // that the padding is all zeros, it is OK to read from the padding bits.)
  //
  // Let's say we're interested in the digitalSignature (0) bit. We'd need to
  // look at the bit 0 (the most significant bit), which is set, so that means
  // digitalSignature is asserted. Similarly, keyEncipherment (2) and
  // dataEncipherment (3) are asserted.
  //
  // Note that since the KeyUsage enumeration is limited to values 0-7, we
  // only ever need to examine the first byte test for
  // requiredKeyUsageIfPresent.

  if (requiredKeyUsageIfPresent != KeyUsage::noParticularKeyUsageRequired) {
    // Check that the required key usage bit is set.
    if ((bits & KeyUsageToBitMask(requiredKeyUsageIfPresent)) == 0) {
      return Fail(RecoverableError, SEC_ERROR_INADEQUATE_KEY_USAGE);
    }
  }

  if (endEntityOrCA != EndEntityOrCA::MustBeCA) {
    // RFC 5280 says "The keyCertSign bit is asserted when the subject public
    // key is used for verifying signatures on public key certificates. If the
    // keyCertSign bit is asserted, then the cA bit in the basic constraints
    // extension (Section 4.2.1.9) MUST also be asserted."
    if ((bits & KeyUsageToBitMask(KeyUsage::keyCertSign)) != 0) {
      return Fail(RecoverableError, SEC_ERROR_INADEQUATE_KEY_USAGE);
    }
  }

  // The padding applies to the last byte, so skip to the last byte.
  while (!value.AtEnd()) {
    if (value.Read(bits) != der::Success) {
      return Fail(RecoverableError, SEC_ERROR_INADEQUATE_KEY_USAGE);
    }
  }

  // All of the padding bits must be zero, according to DER rules.
  uint8_t paddingMask = static_cast<uint8_t>((1 << numberOfPaddingBits) - 1);
  if ((bits & paddingMask) != 0) {
    return Fail(RecoverableError, SEC_ERROR_INADEQUATE_KEY_USAGE);
  }

  return Success;
}

// RFC5820 4.2.1.4. Certificate Policies
//
// "The user-initial-policy-set contains the special value any-policy if the
// user is not concerned about certificate policy."
Result
CheckCertificatePolicies(BackCert& cert, EndEntityOrCA endEntityOrCA,
                         bool isTrustAnchor, SECOidTag requiredPolicy)
{
  if (requiredPolicy == SEC_OID_X509_ANY_POLICY) {
    return Success;
  }

  // It is likely some callers will pass SEC_OID_UNKNOWN when they don't care,
  // instead of passing SEC_OID_X509_ANY_POLICY. Help them out by failing hard.
  if (requiredPolicy == SEC_OID_UNKNOWN) {
    PR_SetError(SEC_ERROR_INVALID_ARGS, 0);
    return FatalError;
  }

  // Bug 989051. Until we handle inhibitAnyPolicy we will fail close when
  // inhibitAnyPolicy extension is present and we need to evaluate certificate
  // policies.
  if (cert.encodedInhibitAnyPolicy) {
    PR_SetError(SEC_ERROR_POLICY_VALIDATION_FAILED, 0);
    return RecoverableError;
  }

  // The root CA certificate may omit the policies that it has been
  // trusted for, so we cannot require the policies to be present in those
  // certificates. Instead, the determination of which roots are trusted for
  // which policies is made by the TrustDomain's GetCertTrust method.
  if (isTrustAnchor && endEntityOrCA == MustBeCA) {
    return Success;
  }

  if (!cert.encodedCertificatePolicies) {
    PR_SetError(SEC_ERROR_POLICY_VALIDATION_FAILED, 0);
    return RecoverableError;
  }

  ScopedPtr<CERTCertificatePolicies, CERT_DestroyCertificatePoliciesExtension>
    policies(CERT_DecodeCertificatePoliciesExtension(
                cert.encodedCertificatePolicies));
  if (!policies) {
    return MapSECStatus(SECFailure);
  }

  for (const CERTPolicyInfo* const* policyInfos = policies->policyInfos;
       *policyInfos; ++policyInfos) {
    if ((*policyInfos)->oid == requiredPolicy) {
      return Success;
    }
    // Intermediate certs are allowed to have the anyPolicy OID
    if (endEntityOrCA == MustBeCA &&
        (*policyInfos)->oid == SEC_OID_X509_ANY_POLICY) {
      return Success;
    }
  }

  PR_SetError(SEC_ERROR_POLICY_VALIDATION_FAILED, 0);
  return RecoverableError;
}

//  BasicConstraints ::= SEQUENCE {
//          cA                      BOOLEAN DEFAULT FALSE,
//          pathLenConstraint       INTEGER (0..MAX) OPTIONAL }
der::Result
DecodeBasicConstraints(const SECItem* encodedBasicConstraints,
                       CERTBasicConstraints& basicConstraints)
{
  PR_ASSERT(encodedBasicConstraints);
  if (!encodedBasicConstraints) {
    return der::Fail(SEC_ERROR_INVALID_ARGS);
  }

  basicConstraints.isCA = false;
  basicConstraints.pathLenConstraint = 0;

  der::Input input;
  if (input.Init(encodedBasicConstraints->data, encodedBasicConstraints->len)
        != der::Success) {
    return der::Fail(SEC_ERROR_EXTENSION_VALUE_INVALID);
  }

  if (der::ExpectTagAndIgnoreLength(input, der::SEQUENCE) != der::Success) {
    return der::Fail(SEC_ERROR_EXTENSION_VALUE_INVALID);
  }

  bool isCA = false;
  // TODO(bug 989518): cA is by default false. According to DER, default
  // values must not be explicitly encoded in a SEQUENCE. So, if this
  // value is present and false, it is an encoding error. However, Go Daddy
  // has issued many certificates with this improper encoding, so we can't
  // enforce this yet (hence passing true for allowInvalidExplicitEncoding
  // to der::OptionalBoolean).
  if (der::OptionalBoolean(input, true, isCA) != der::Success) {
    return der::Fail(SEC_ERROR_EXTENSION_VALUE_INVALID);
  }
  basicConstraints.isCA = isCA;

  if (input.Peek(der::INTEGER)) {
    SECItem pathLenConstraintEncoded;
    if (der::Integer(input, pathLenConstraintEncoded) != der::Success) {
      return der::Fail(SEC_ERROR_EXTENSION_VALUE_INVALID);
    }
    long pathLenConstraint = DER_GetInteger(&pathLenConstraintEncoded);
    if (pathLenConstraint >= std::numeric_limits<int>::max() ||
        pathLenConstraint < 0) {
      return der::Fail(SEC_ERROR_EXTENSION_VALUE_INVALID);
    }
    basicConstraints.pathLenConstraint = static_cast<int>(pathLenConstraint);
    // TODO(bug 985025): If isCA is false, pathLenConstraint MUST NOT
    // be included (as per RFC 5280 section 4.2.1.9), but for compatibility
    // reasons, we don't check this for now.
  } else if (basicConstraints.isCA) {
    // If this is a CA but the path length is omitted, it is unlimited.
    basicConstraints.pathLenConstraint = CERT_UNLIMITED_PATH_CONSTRAINT;
  }

  if (der::End(input) != der::Success) {
    return der::Fail(SEC_ERROR_EXTENSION_VALUE_INVALID);
  }
  return der::Success;
}

// RFC5280 4.2.1.9. Basic Constraints (id-ce-basicConstraints)
Result
CheckBasicConstraints(const BackCert& cert,
                      EndEntityOrCA endEntityOrCA,
                      bool isTrustAnchor,
                      unsigned int subCACount)
{
  CERTBasicConstraints basicConstraints;
  if (cert.encodedBasicConstraints) {
    if (DecodeBasicConstraints(cert.encodedBasicConstraints,
                               basicConstraints) != der::Success) {
      return RecoverableError;
    }
  } else {
    // Synthesize a non-CA basic constraints by default
    basicConstraints.isCA = false;
    basicConstraints.pathLenConstraint = 0;

    // "If the basic constraints extension is not present in a version 3
    //  certificate, or the extension is present but the cA boolean is not
    //  asserted, then the certified public key MUST NOT be used to verify
    //  certificate signatures."
    //
    // For compatibility, we must accept v1 trust anchors without basic
    // constraints as CAs.
    //
    // TODO: add check for self-signedness?
    if (endEntityOrCA == MustBeCA && isTrustAnchor) {
      const CERTCertificate* nssCert = cert.GetNSSCert();
      // We only allow trust anchor CA certs to omit the
      // basicConstraints extension if they are v1. v1 is encoded
      // implicitly.
      if (!nssCert->version.data && !nssCert->version.len) {
        basicConstraints.isCA = true;
        basicConstraints.pathLenConstraint = CERT_UNLIMITED_PATH_CONSTRAINT;
      }
    }
  }

  if (endEntityOrCA == MustBeEndEntity) {
    // CA certificates are not trusted as EE certs.

    if (basicConstraints.isCA) {
      // XXX: We use SEC_ERROR_CA_CERT_INVALID here so we can distinguish
      // this error from other errors, given that NSS does not have a "CA cert
      // used as end-entity" error code since it doesn't have such a
      // prohibition. We should add such an error code and stop abusing
      // SEC_ERROR_CA_CERT_INVALID this way.
      //
      // Note, in particular, that this check prevents a delegated OCSP
      // response signing certificate with the CA bit from successfully
      // validating when we check it from pkixocsp.cpp, which is a good thing.
      //
      return Fail(RecoverableError, SEC_ERROR_CA_CERT_INVALID);
    }

    return Success;
  }

  PORT_Assert(endEntityOrCA == MustBeCA);

  // End-entity certificates are not allowed to act as CA certs.
  if (!basicConstraints.isCA) {
    return Fail(RecoverableError, SEC_ERROR_CA_CERT_INVALID);
  }

  if (basicConstraints.pathLenConstraint >= 0) {
    if (subCACount >
           static_cast<unsigned int>(basicConstraints.pathLenConstraint)) {
      return Fail(RecoverableError, SEC_ERROR_PATH_LEN_CONSTRAINT_INVALID);
    }
  }

  return Success;
}

Result
BackCert::GetConstrainedNames(/*out*/ const CERTGeneralName** result)
{
  if (!constrainedNames) {
    if (!GetArena()) {
      return FatalError;
    }

    constrainedNames =
      CERT_GetConstrainedCertificateNames(nssCert, arena.get(),
                                          cnOptions == IncludeCN);
    if (!constrainedNames) {
      return MapSECStatus(SECFailure);
    }
  }

  *result = constrainedNames;
  return Success;
}

// 4.2.1.10. Name Constraints
Result
CheckNameConstraints(BackCert& cert)
{
  static const char constraintFranceGov[] =
                                     "\x30\x5D" /* sequence len 93*/
                                     "\xA0\x5B" /* element len 91 */
                                     "\x30\x05" /* sequence len 5 */
                                     "\x82\x03" /* entry len 3 */
                                     ".fr"
                                     "\x30\x05\x82\x03" /* sequence len 5, entry len 3 */
                                     ".gp"
                                     "\x30\x05\x82\x03"
                                     ".gf"
                                     "\x30\x05\x82\x03"
                                     ".mq"
                                     "\x30\x05\x82\x03"
                                     ".re"
                                     "\x30\x05\x82\x03"
                                     ".yt"
                                     "\x30\x05\x82\x03"
                                     ".pm"
                                     "\x30\x05\x82\x03"
                                     ".bl"
                                     "\x30\x05\x82\x03"
                                     ".mf"
                                     "\x30\x05\x82\x03"
                                     ".wf"
                                     "\x30\x05\x82\x03"
                                     ".pf"
                                     "\x30\x05\x82\x03"
                                     ".nc"
                                     "\x30\x05\x82\x03"
                                     ".tf";

  /* The stringified value for the subject is:
     E=igca@sgdn.pm.gouv.fr,CN=IGC/A,OU=DCSSI,O=PM/SGDN,L=Paris,ST=France,C=FR
   */
  static const char rawANSSISubject[] =
                                 "\x30\x81\x85\x31\x0B\x30\x09\x06\x03\x55\x04"
                                 "\x06\x13\x02\x46\x52\x31\x0F\x30\x0D\x06\x03"
                                 "\x55\x04\x08\x13\x06\x46\x72\x61\x6E\x63\x65"
                                 "\x31\x0E\x30\x0C\x06\x03\x55\x04\x07\x13\x05"
                                 "\x50\x61\x72\x69\x73\x31\x10\x30\x0E\x06\x03"
                                 "\x55\x04\x0A\x13\x07\x50\x4D\x2F\x53\x47\x44"
                                 "\x4E\x31\x0E\x30\x0C\x06\x03\x55\x04\x0B\x13"
                                 "\x05\x44\x43\x53\x53\x49\x31\x0E\x30\x0C\x06"
                                 "\x03\x55\x04\x03\x13\x05\x49\x47\x43\x2F\x41"
                                 "\x31\x23\x30\x21\x06\x09\x2A\x86\x48\x86\xF7"
                                 "\x0D\x01\x09\x01\x16\x14\x69\x67\x63\x61\x40"
                                 "\x73\x67\x64\x6E\x2E\x70\x6D\x2E\x67\x6F\x75"
                                 "\x76\x2E\x66\x72";

  const SECItem ANSSI_SUBJECT = {
    siBuffer,
    reinterpret_cast<uint8_t *>(const_cast<char *>(rawANSSISubject)),
    sizeof(rawANSSISubject) - 1
  };

  const SECItem PERMIT_FRANCE_GOV_NC = {
    siBuffer,
    reinterpret_cast<uint8_t *>(const_cast<char *>(constraintFranceGov)),
    sizeof(constraintFranceGov) - 1
  };

  const SECItem* nameConstraintsToUse = cert.encodedNameConstraints;

  if (!nameConstraintsToUse) {
    if (SECITEM_ItemsAreEqual(&cert.GetNSSCert()->derSubject, &ANSSI_SUBJECT)) {
      nameConstraintsToUse = &PERMIT_FRANCE_GOV_NC;
    } else {
      return Success;
    }
  }

  PLArenaPool* arena = cert.GetArena();
  if (!arena) {
    return FatalError;
  }

  // Owned by arena
  const CERTNameConstraints* constraints =
    CERT_DecodeNameConstraintsExtension(arena, nameConstraintsToUse);
  if (!constraints) {
    return MapSECStatus(SECFailure);
  }

  for (BackCert* prev = cert.childCert; prev; prev = prev->childCert) {
    const CERTGeneralName* names = nullptr;
    Result rv = prev->GetConstrainedNames(&names);
    if (rv != Success) {
      return rv;
    }
    PORT_Assert(names);
    CERTGeneralName* currentName = const_cast<CERTGeneralName*>(names);
    do {
      if (CERT_CheckNameSpace(arena, constraints, currentName) != SECSuccess) {
        // XXX: It seems like CERT_CheckNameSpace doesn't always call
        // PR_SetError when it fails. We set the error code here, though this
        // may be papering over some fatal errors. NSS's
        // cert_VerifyCertChainOld does something similar.
        PR_SetError(SEC_ERROR_CERT_NOT_IN_NAME_SPACE, 0);
        return RecoverableError;
      }
      currentName = CERT_GetNextGeneralName(currentName);
    } while (currentName != names);
  }

  return Success;
}

// 4.2.1.12. Extended Key Usage (id-ce-extKeyUsage)
// 4.2.1.12. Extended Key Usage (id-ce-extKeyUsage)
Result
CheckExtendedKeyUsage(EndEntityOrCA endEntityOrCA, const SECItem* encodedEKUs,
                      SECOidTag requiredEKU)
{
  // TODO: Either do not allow anyExtendedKeyUsage to be passed as requiredEKU,
  // or require that callers pass anyExtendedKeyUsage instead of
  // SEC_OID_UNKNWON and disallow SEC_OID_UNKNWON.

  // XXX: We're using SEC_ERROR_INADEQUATE_CERT_TYPE here so that callers can
  // distinguish EKU mismatch from KU mismatch from basic constraints mismatch.
  // We should probably add a new error code that is more clear for this type
  // of problem.

  bool foundOCSPSigning = false;

  if (encodedEKUs) {
    ScopedPtr<CERTOidSequence, CERT_DestroyOidSequence>
      seq(CERT_DecodeOidSequence(encodedEKUs));
    if (!seq) {
      PR_SetError(SEC_ERROR_INADEQUATE_CERT_TYPE, 0);
      return RecoverableError;
    }

    bool found = false;

    // XXX: We allow duplicate entries.
    for (const SECItem* const* oids = seq->oids; oids && *oids; ++oids) {
      SECOidTag oidTag = SECOID_FindOIDTag(*oids);
      if (requiredEKU != SEC_OID_UNKNOWN && oidTag == requiredEKU) {
        found = true;
      } else {
        // Treat CA certs with step-up OID as also having SSL server type.
        // COMODO has issued certificates that require this behavior
        // that don't expire until June 2020!
        // TODO 982932: Limit this expection to old certificates
        if (endEntityOrCA == MustBeCA &&
            requiredEKU == SEC_OID_EXT_KEY_USAGE_SERVER_AUTH &&
            oidTag == SEC_OID_NS_KEY_USAGE_GOVT_APPROVED) {
          found = true;
        }
      }
      if (oidTag == SEC_OID_OCSP_RESPONDER) {
        foundOCSPSigning = true;
      }
    }

    // If the EKU extension was included, then the required EKU must be in the
    // list.
    if (!found) {
      PR_SetError(SEC_ERROR_INADEQUATE_CERT_TYPE, 0);
      return RecoverableError;
    }
  }

  // pkixocsp.cpp depends on the following additional checks.

  if (endEntityOrCA == MustBeEndEntity) {
    // When validating anything other than an delegated OCSP signing cert,
    // reject any cert that also claims to be an OCSP responder, because such
    // a cert does not make sense. For example, if an SSL certificate were to
    // assert id-kp-OCSPSigning then it could sign OCSP responses for itself,
    // if not for this check.
    // That said, we accept CA certificates with id-kp-OCSPSigning because
    // some CAs in Mozilla's CA program have issued such intermediate
    // certificates, and because some CAs have reported some Microsoft server
    // software wrongly requires CA certificates to have id-kp-OCSPSigning.
    // Allowing this exception does not cause any security issues because we
    // require delegated OCSP response signing certificates to be end-entity
    // certificates.
    if (foundOCSPSigning && requiredEKU != SEC_OID_OCSP_RESPONDER) {
      PR_SetError(SEC_ERROR_INADEQUATE_CERT_TYPE, 0);
      return RecoverableError;
    }
    // http://tools.ietf.org/html/rfc6960#section-4.2.2.2:
    // "OCSP signing delegation SHALL be designated by the inclusion of
    // id-kp-OCSPSigning in an extended key usage certificate extension
    // included in the OCSP response signer's certificate."
    //
    // id-kp-OCSPSigning is the only EKU that isn't implicitly assumed when the
    // EKU extension is missing from an end-entity certificate. However, any CA
    // certificate can issue a delegated OCSP response signing certificate, so
    // we can't require the EKU be explicitly included for CA certificates.
    if (!foundOCSPSigning && requiredEKU == SEC_OID_OCSP_RESPONDER) {
      PR_SetError(SEC_ERROR_INADEQUATE_CERT_TYPE, 0);
      return RecoverableError;
    }
  }

  return Success;
}

Result
CheckIssuerIndependentProperties(TrustDomain& trustDomain,
                                 BackCert& cert,
                                 PRTime time,
                                 EndEntityOrCA endEntityOrCA,
                                 KeyUsage requiredKeyUsageIfPresent,
                                 SECOidTag requiredEKUIfPresent,
                                 SECOidTag requiredPolicy,
                                 unsigned int subCACount,
                /*optional out*/ TrustDomain::TrustLevel* trustLevelOut)
{
  Result rv;

  TrustDomain::TrustLevel trustLevel;
  rv = MapSECStatus(trustDomain.GetCertTrust(endEntityOrCA,
                                             requiredPolicy,
                                             cert.GetNSSCert(),
                                             &trustLevel));
  if (rv != Success) {
    return rv;
  }
  if (trustLevel == TrustDomain::ActivelyDistrusted) {
    PORT_SetError(SEC_ERROR_UNTRUSTED_CERT);
    return RecoverableError;
  }
  if (trustLevel != TrustDomain::TrustAnchor &&
      trustLevel != TrustDomain::InheritsTrust) {
    // The TrustDomain returned a trust level that we weren't expecting.
    PORT_SetError(PR_INVALID_STATE_ERROR);
    return FatalError;
  }
  if (trustLevelOut) {
    *trustLevelOut = trustLevel;
  }

  bool isTrustAnchor = endEntityOrCA == MustBeCA &&
                       trustLevel == TrustDomain::TrustAnchor;

  PLArenaPool* arena = cert.GetArena();
  if (!arena) {
    return FatalError;
  }

  // 4.2.1.1. Authority Key Identifier is ignored (see bug 965136).

  // 4.2.1.2. Subject Key Identifier is ignored (see bug 965136).

  // 4.2.1.3. Key Usage
  rv = CheckKeyUsage(endEntityOrCA, cert.encodedKeyUsage,
                     requiredKeyUsageIfPresent);
  if (rv != Success) {
    return rv;
  }

  // 4.2.1.4. Certificate Policies
  rv = CheckCertificatePolicies(cert, endEntityOrCA, isTrustAnchor,
                                requiredPolicy);
  if (rv != Success) {
    return rv;
  }

  // 4.2.1.5. Policy Mappings are not supported; see the documentation about
  //          policy enforcement in pkix.h.

  // 4.2.1.6. Subject Alternative Name dealt with during name constraint
  //          checking and during name verification (CERT_VerifyCertName).

  // 4.2.1.7. Issuer Alternative Name is not something that needs checking.

  // 4.2.1.8. Subject Directory Attributes is not something that needs
  //          checking.

  // 4.2.1.9. Basic Constraints.
  rv = CheckBasicConstraints(cert, endEntityOrCA, isTrustAnchor, subCACount);
  if (rv != Success) {
    return rv;
  }

  // 4.2.1.10. Name Constraints is dealt with in during path building.

  // 4.2.1.11. Policy Constraints are implicitly supported; see the
  //           documentation about policy enforcement in pkix.h.

  // 4.2.1.12. Extended Key Usage
  rv = CheckExtendedKeyUsage(endEntityOrCA, cert.encodedExtendedKeyUsage,
                             requiredEKUIfPresent);
  if (rv != Success) {
    return rv;
  }

  // 4.2.1.13. CRL Distribution Points is not supported, though the
  //           TrustDomain's CheckRevocation method may parse it and process it
  //           on its own.

  // 4.2.1.14. Inhibit anyPolicy is implicitly supported; see the documentation
  //           about policy enforcement in pkix.h.

  // IMPORTANT: This check must come after the other checks in order for error
  // ranking to work correctly.
  rv = CheckTimes(cert.GetNSSCert(), time);
  if (rv != Success) {
    return rv;
  }

  return Success;
}

} } // namespace mozilla::pkix
