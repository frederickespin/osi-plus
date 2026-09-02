import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const invariant = (condition, message) => { if (!condition) throw new Error(message); };
const domain = read("api/_lib/crmQuoteProposalDomain.js");
const schema = read("prisma/schema.prisma");
const contract = read("docs/V17-CRM-QUOTE-DOMAIN-08A-CONTRACT.md");

invariant(/productionApiEnabled:\s*false/.test(domain), "La API productiva de cotización debe permanecer desactivada");
invariant(/persistenceEnabled:\s*false/.test(domain), "La persistencia debe permanecer desactivada en esta fase");
invariant(/runtimeConsumers:\s*0/.test(domain), "No se permiten consumidores runtime en esta fase");
invariant(/taxComputationEnabled:\s*false/.test(domain), "Los impuestos deben permanecer diferidos");
invariant(/canonicalHeader:\s*"PipelineCaseQuote"/.test(domain), "PipelineCaseQuote debe ser la cabecera canónica elegida");
invariant(/legacyQuoteAuthority:\s*false/.test(domain), "La cotización legacy no puede declararse autoridad");
invariant(/input\.proposals\.length\s*>\s*3/.test(domain), "Debe existir el límite de tres propuestas");
invariant(/CRM_QUOTE_MULTIPLE_APPROVALS/.test(domain), "Debe impedirse aprobar más de una propuesta");
invariant(/OWN_MARGIN_BELOW_MINIMUM/.test(domain), "Debe bloquearse el margen propio insuficiente");
invariant(/CONCEPT_PENDING/.test(domain), "Los conceptos pendientes deben bloquear la aprobación");
invariant(/DESTINATION_PENDING/.test(domain), "El destino pendiente debe bloquear la aprobación");
invariant(!/estimatedCbm/.test(domain), "El dominio no puede aceptar volumen estimado del ICP");
invariant(/SURVEY_PUBLISHED/.test(domain) && /CLIENT_PROVIDED/.test(domain), "El volumen sólo puede proceder de Survey publicado o datos del cliente");
invariant(/DEFERRED_NOT_COMPUTED/.test(domain), "El tratamiento tributario diferido debe ser explícito");
invariant(/model PipelineCaseQuote/.test(schema) && /@@map\("osi_pipeline_case_quotes"\)/.test(schema), "Falta la cabecera canónica existente");
invariant(/No añade migraciones/.test(contract), "El contrato debe impedir migraciones prematuras");

process.stdout.write(JSON.stringify({ ok: true, assertions: 16, target: "V17_CRM_QUOTE_DOMAIN_08A_GUARD" }, null, 2));
