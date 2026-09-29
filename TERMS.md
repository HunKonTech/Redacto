# Redacto Terms of Use

Version: 0.x (public beta). Effective: 29 September 2026.

## 1. Provider and scope

(1) Redacto (the "Software") is a browser extension, a web page and IDE plugins that help you find and replace personal data in text before you paste it into AI chat services. It is published free of charge and for non-commercial purposes by Benedek Koncsik, a private individual (the "Maintainer"). Contact details are in the [Legal Notice](IMPRESSUM.md).

(2) These Terms apply to everyone who downloads, installs or uses the Software ("you").

(3) Redacto is a modified version of Privacy Guardrail, developed by the Deutsches Forschungszentrum für Künstliche Intelligenz GmbH (DFKI). DFKI is not a party to these Terms. It does not provide, support or endorse Redacto, and it is not responsible for it. See [FORK.md](FORK.md).

## 2. License

(1) The Software is licensed under the [Apache License, Version 2.0](LICENSE). Your rights to use, copy, modify and distribute it come only from that license. These Terms do not restrict them.

(2) If these Terms conflict with the Apache License, Version 2.0, the license prevails.

(3) Third-party components remain under their own licenses. This includes ONNX Runtime Web, the bundled NER model, fonts and other dependencies, as listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

(4) The license does not grant rights to the names or logos of Redacto, Privacy Guardrail or DFKI (Section 6 of the license), except to describe the origin of the Software.

## 3. What the Software does

(1) The Software checks text that you paste into a supported chat service, into the side panel or into an IDE plugin. It uses deterministic recognizers and, optionally, a transformer model that runs in your browser. You then review the detected items and choose which ones are replaced with placeholders. Replies that contain those placeholders can be restored to the original values on your device.

(2) All detection runs locally on your device. The Software does not send the text you process to the Maintainer or to any server operated for the project, and it has no telemetry. See the [Privacy Policy](PRIVACY.md).

(3) The Software is a public beta and an assistive tool. It is not a compliance or data-loss-prevention product and does not anonymize data in a legal sense.

## 4. Limitations and your responsibility

(1) Detection is incomplete. The Software can miss personal or confidential data (false negatives) and can flag harmless text (false positives). Detection quality depends on the language, the formatting, your browser, your device memory and WebGPU support.

(2) Text that you type directly into a chat box, rather than paste, is not reviewed on the chat sites. Restoring placeholders cannot follow every rewrite that an AI model makes.

(3) Review the result yourself before you send it. Do not rely on the Software as your only safeguard where disclosing data could have serious legal, financial or security consequences.

(4) You remain responsible for your use of third-party AI services and for any processing of personal data that you carry out with the Software, including your obligations under the GDPR and the EU AI Act.

## 5. No warranty

The Software is provided "as is", without warranties or conditions of any kind, as set out in Section 7 of the Apache License, Version 2.0. The Maintainer does not owe updates, maintenance, support or any particular availability. Any updates are provided voluntarily.

## 6. Limitation of liability

(1) To the extent permitted by law, the Maintainer is not liable for any damages arising from the use of, or the inability to use, the Software, as set out in Section 8 of the Apache License, Version 2.0. This includes data that the Software failed to detect, loss of data, and damages caused by third-party services.

(2) This limitation does not apply to liability for intent or gross negligence, for injury to life, body or health, or to any other liability that cannot be excluded under the law applicable to you.

## 7. Modified versions

If you distribute your own modified version of the Software, you are responsible for it and for complying with the Apache License, Version 2.0 and the third-party licenses. The Maintainer is not responsible for versions distributed by others.

## 8. Changes and termination

(1) The Maintainer may change or discontinue the Software, or these Terms, at any time. The version of the Terms published in the repository at the time you use the Software applies.

(2) Rights already granted to you under the Apache License, Version 2.0 for a version you have received are not affected.

## 9. Final provisions

(1) These Terms are governed by the law of Hungary. Mandatory consumer-protection rules of the country where you live remain unaffected.

(2) If any provision of these Terms is invalid, the remaining provisions stay in effect.
