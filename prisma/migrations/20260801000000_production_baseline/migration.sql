--
-- PostgreSQL database dump
--


-- Dumped from database version 17.10 (4f20678)
-- Dumped by pg_dump version 18.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
-- DB-01C: do not change the migration connection search_path. Prisma must keep
-- its canonical osi._prisma_migrations table visible after this script ends.
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: osi; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS osi;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: AcceptanceStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."AcceptanceStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'REJECTED'
);


--
-- Name: AccountSurchargeHandling; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."AccountSurchargeHandling" AS ENUM (
    'CHARGE',
    'INCLUDE',
    'DISABLE'
);


--
-- Name: AccountType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."AccountType" AS ENUM (
    'INDIVIDUAL',
    'CORPORATE',
    'AGENT',
    'GOVERNMENT',
    'NON_PROFIT'
);


--
-- Name: AddressRole; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."AddressRole" AS ENUM (
    'ORIGIN',
    'DESTINATION',
    'PICKUP_LOCAL',
    'DELIVERY_LOCAL',
    'STORAGE_LOCATION',
    'BILLING'
);


--
-- Name: CommercialEventStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."CommercialEventStatus" AS ENUM (
    'SCHEDULED',
    'CONFIRMED',
    'DONE',
    'CANCELLED'
);


--
-- Name: CommercialEventType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."CommercialEventType" AS ENUM (
    'SURVEY',
    'FOLLOW_UP',
    'DEADLINE',
    'SERVICE'
);


--
-- Name: CommercialServiceType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."CommercialServiceType" AS ENUM (
    'EXPORT',
    'IMPORT',
    'LOCAL_ORIGIN',
    'LOCAL_DESTINATION',
    'LOCAL_INTERNAL',
    'STORAGE',
    'CRATING'
);


--
-- Name: CommissionAppliesTo; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."CommissionAppliesTo" AS ENUM (
    'LEAD',
    'INVOICE',
    'COLLECTION',
    'MARGIN'
);


--
-- Name: CommissionStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."CommissionStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'PAYABLE',
    'PAID',
    'VOID'
);


--
-- Name: CommissionType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."CommissionType" AS ENUM (
    'PERCENT',
    'FIXED'
);


--
-- Name: CratingRequestStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."CratingRequestStatus" AS ENUM (
    'NEEDED',
    'ESTIMATING',
    'APPROVED',
    'IN_PRODUCTION',
    'DELIVERED'
);


--
-- Name: EntityKind; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."EntityKind" AS ENUM (
    'COMPANY',
    'PERSON'
);


--
-- Name: EntityTypeCode; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."EntityTypeCode" AS ENUM (
    'CLIENT',
    'CORPORATE',
    'ACCOUNT',
    'PARTNER',
    'AGENT',
    'REFERRER',
    'SUPPLIER'
);


--
-- Name: KycDocumentStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."KycDocumentStatus" AS ENUM (
    'UPLOADED',
    'VALIDATED',
    'REJECTED'
);


--
-- Name: KycDocumentType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."KycDocumentType" AS ENUM (
    'PASSPORT_ID',
    'POWER_OF_ATTORNEY',
    'VALUATION_LETTER',
    'COMPLIANCE_CHECKLIST',
    'TAX_REGISTRATION',
    'OTHER'
);


--
-- Name: LeadConversionStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."LeadConversionStatus" AS ENUM (
    'PENDING',
    'READY',
    'CONVERTED',
    'SENT_TO_K'
);


--
-- Name: LeadDerivedMode; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."LeadDerivedMode" AS ENUM (
    'NATIONAL',
    'IMPORT_EXPORT',
    'PENDING'
);


--
-- Name: LeadEstimateConfidence; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."LeadEstimateConfidence" AS ENUM (
    'LOW',
    'MED',
    'HIGH'
);


--
-- Name: LeadModePolicy; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."LeadModePolicy" AS ENUM (
    'FIXED',
    'BY_DESTINATION'
);


--
-- Name: LeadPartyRole; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."LeadPartyRole" AS ENUM (
    'CLIENT',
    'BILL_TO',
    'ACCOUNT',
    'PARTNER',
    'REFERRER',
    'CORPORATE_OWNER',
    'AGENT_ORIGIN',
    'AGENT_DESTINATION'
);


--
-- Name: LeadSourceChannel; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."LeadSourceChannel" AS ENUM (
    'WHATSAPP',
    'PHONE',
    'EMAIL',
    'WEB',
    'REFERRAL',
    'PARTNER',
    'CORPORATE',
    'OTHER'
);


--
-- Name: LeadStage; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."LeadStage" AS ENUM (
    'NEW_LEAD',
    'CONTACTADO',
    'SURVEY_PENDIENTE',
    'SURVEY_REALIZADO',
    'COTIZANDO',
    'PROPUESTA_ENVIADA',
    'FOLLOW_UP',
    'GANADO',
    'PERDIDO',
    'EXPEDIENTE_ABIERTO',
    'EN_COORDINACION',
    'LISTO_PARA_HANDOFF'
);


--
-- Name: LeadType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."LeadType" AS ENUM (
    'L1',
    'L2',
    'L3',
    'L4'
);


--
-- Name: LocationType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."LocationType" AS ENUM (
    'ORIGIN',
    'DESTINATION',
    'WAREHOUSE',
    'OFFICE',
    'OTHER'
);


--
-- Name: LongCarryBand; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."LongCarryBand" AS ENUM (
    'NONE',
    'LOW',
    'MEDIUM',
    'HIGH'
);


--
-- Name: MasterTariffScope; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."MasterTariffScope" AS ENUM (
    'INTL',
    'LOCAL',
    'GOV',
    'CORP'
);


--
-- Name: NoDestinationCaseType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."NoDestinationCaseType" AS ENUM (
    'CASE_A_PACKING_ORIGIN',
    'CASE_B_ORIGIN_STORAGE',
    'CASE_C_PICKUP_NO_DELIVERY'
);


--
-- Name: OsiCustodyStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."OsiCustodyStatus" AS ENUM (
    'DRIVER',
    'SUPERVISOR'
);


--
-- Name: OsiHandshakeStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."OsiHandshakeStatus" AS ENUM (
    'PENDING',
    'COMPLETED',
    'REJECTED'
);


--
-- Name: OsiKind; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."OsiKind" AS ENUM (
    'EXTERNAL',
    'INTERNAL'
);


--
-- Name: ParkingDifficulty; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."ParkingDifficulty" AS ENUM (
    'EASY',
    'MEDIUM',
    'HARD'
);


--
-- Name: PgdFileType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PgdFileType" AS ENUM (
    'PDF',
    'PHOTO',
    'SIGNATURE',
    'OTHER'
);


--
-- Name: PgdItemStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PgdItemStatus" AS ENUM (
    'MISSING',
    'SUBMITTED',
    'VALIDATED',
    'REJECTED'
);


--
-- Name: PgdResponsible; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PgdResponsible" AS ENUM (
    'CLIENT',
    'SUPERVISOR',
    'DRIVER',
    'INTERNAL'
);


--
-- Name: PgdVisibility; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PgdVisibility" AS ENUM (
    'CLIENT_VIEW',
    'INTERNAL_VIEW'
);


--
-- Name: PipelineCaseStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PipelineCaseStatus" AS ENUM (
    'NEW_INBOX',
    'AWAITING_ICP',
    'GOVERNANCE_CONFIRMED',
    'REQUIREMENTS_CONFIRMED',
    'SURVEY_PLANNING',
    'SURVEY_SCHEDULED',
    'SURVEY_COMPLETED',
    'CRATING_ESTIMATE_PENDING',
    'PRICING_IN_PROGRESS',
    'INTERNAL_REVIEW',
    'QUOTE_SENT',
    'NEGOTIATION',
    'CHANGE_CONTROL',
    'APPROVED',
    'OPS_HANDOFF'
);


--
-- Name: PipelineCustomerType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PipelineCustomerType" AS ENUM (
    'L1_AGENT',
    'L2_INTL_DIRECT',
    'L3_CORPORATE',
    'L4_PERSONAL'
);


--
-- Name: PipelineEventStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PipelineEventStatus" AS ENUM (
    'PENDING',
    'DONE',
    'CANCELLED'
);


--
-- Name: PipelineEventType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PipelineEventType" AS ENUM (
    'SURVEY',
    'FOLLOW_UP',
    'DEADLINE',
    'SERVICE'
);


--
-- Name: PipelineMode; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PipelineMode" AS ENUM (
    'LOCAL',
    'EXPORT',
    'IMPORT'
);


--
-- Name: PipelineQuoteLevel; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PipelineQuoteLevel" AS ENUM (
    'BASIC',
    'STANDARD',
    'PREMIUM'
);


--
-- Name: PipelineSurveyMethod; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PipelineSurveyMethod" AS ENUM (
    'PRESENCIAL',
    'VIRTUAL',
    'LISTADO_FOTOS',
    'NO_APLICA'
);


--
-- Name: ProjectKState; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."ProjectKState" AS ENUM (
    'PENDING_VALIDATION',
    'VALIDATED',
    'RELEASED'
);


--
-- Name: PtfSuggestionStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."PtfSuggestionStatus" AS ENUM (
    'PENDING',
    'APPLIED',
    'IGNORED',
    'ESCALATED'
);


--
-- Name: QuoteBlock; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."QuoteBlock" AS ENUM (
    'ORIGIN',
    'TRANSPORT',
    'DESTINATION',
    'THIRD_PARTY',
    'STORAGE'
);


--
-- Name: QuoteItemType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."QuoteItemType" AS ENUM (
    'SERVICE',
    'SURCHARGE',
    'MATERIAL',
    'CRATING',
    'DISCOUNT',
    'TAX'
);


--
-- Name: QuoteLevel; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."QuoteLevel" AS ENUM (
    'ESTIMATE',
    'FINAL'
);


--
-- Name: QuoteStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."QuoteStatus" AS ENUM (
    'DRAFT',
    'SENT',
    'APPROVED',
    'REJECTED',
    'EXPIRED'
);


--
-- Name: RequirementStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."RequirementStatus" AS ENUM (
    'PENDING',
    'RECEIVED',
    'APPROVED',
    'NOT_REQUIRED'
);


--
-- Name: ServiceCaseCustomerType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."ServiceCaseCustomerType" AS ENUM (
    'L1_AGENT',
    'L2_INTL_DIRECT',
    'L3_CORPORATE',
    'L4_PERSONAL'
);


--
-- Name: ServiceCaseMode; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."ServiceCaseMode" AS ENUM (
    'LOCAL',
    'EXPORT',
    'IMPORT'
);


--
-- Name: ServiceCaseStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."ServiceCaseStatus" AS ENUM (
    'NEW_INBOX',
    'AWAITING_ICP',
    'GOVERNANCE_CONFIRMED',
    'REQUIREMENTS_CONFIRMED',
    'SURVEY_PLANNING',
    'SURVEY_SCHEDULED',
    'SURVEY_COMPLETED',
    'CRATING_ESTIMATE_PENDING',
    'PRICING_IN_PROGRESS',
    'INTERNAL_REVIEW',
    'QUOTE_SENT',
    'NEGOTIATION',
    'CHANGE_CONTROL',
    'APPROVED',
    'OPS_HANDOFF',
    'CLOSED_WON',
    'CLOSED_LOST'
);


--
-- Name: ServiceMode; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."ServiceMode" AS ENUM (
    'NATIONAL',
    'IMPORT_EXPORT'
);


--
-- Name: SignalKind; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SignalKind" AS ENUM (
    'PAYMENT',
    'PERMITS_PARKING',
    'PGD_BLOCKING_DOCS',
    'CRATES',
    'THIRD_PARTIES'
);


--
-- Name: SignalPolicy; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SignalPolicy" AS ENUM (
    'HARD_BLOCK',
    'SOFT_ALERT'
);


--
-- Name: SurchargePricingMode; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SurchargePricingMode" AS ENUM (
    'FIXED',
    'PER_UNIT',
    'PER_HOUR',
    'PER_DAY',
    'PER_KM',
    'PCT'
);


--
-- Name: SurveyDimensionUnit; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SurveyDimensionUnit" AS ENUM (
    'CM',
    'IN'
);


--
-- Name: SurveyMediaType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SurveyMediaType" AS ENUM (
    'SITE',
    'PRE_EXISTING_DAMAGE',
    'NESTING_ITEM',
    'OTHER'
);


--
-- Name: SurveyMethod; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SurveyMethod" AS ENUM (
    'PRESENCIAL',
    'VIRTUAL',
    'LISTADO_FOTOS',
    'LISTA',
    'FOTOS'
);


--
-- Name: SurveyPackLevel; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SurveyPackLevel" AS ENUM (
    'P1',
    'P2',
    'P3'
);


--
-- Name: SurveyPropertyType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SurveyPropertyType" AS ENUM (
    'CASA',
    'APARTAMENTO',
    'OFICINA',
    'NAVE'
);


--
-- Name: SurveyRule; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SurveyRule" AS ENUM (
    'ALWAYS',
    'THRESHOLD',
    'OPTIONAL'
);


--
-- Name: SurveyStairsType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SurveyStairsType" AS ENUM (
    'CARACOL',
    'RECTAS',
    'MIXTO'
);


--
-- Name: SurveyStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SurveyStatus" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'SUBMITTED'
);


--
-- Name: SurveyType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."SurveyType" AS ENUM (
    'PRESENCIAL',
    'VIRTUAL',
    'LISTADO'
);


--
-- Name: TariffOverrideScope; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."TariffOverrideScope" AS ENUM (
    'GLOBAL',
    'ROUTE',
    'MODE',
    'SERVICE_TYPE'
);


--
-- Name: TariffRateMode; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."TariffRateMode" AS ENUM (
    'AIR',
    'LCL',
    'FCL',
    'LOCAL'
);


--
-- Name: TemplateScope; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."TemplateScope" AS ENUM (
    'GLOBAL',
    'TENANT'
);


--
-- Name: TemplateType; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."TemplateType" AS ENUM (
    'PIC',
    'PGD',
    'NPS',
    'PST'
);


--
-- Name: TemplateVersionStatus; Type: TYPE; Schema: osi; Owner: -
--

CREATE TYPE osi."TemplateVersionStatus" AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'PUBLISHED',
    'REJECTED',
    'ARCHIVED'
);


--
-- Name: block_import_crating_requests(); Type: FUNCTION; Schema: osi; Owner: -
--

CREATE FUNCTION osi.block_import_crating_requests() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  case_mode "ServiceCaseMode";
BEGIN
  SELECT mode INTO case_mode FROM "service_cases" WHERE id = NEW.case_id;
  IF case_mode = 'IMPORT' THEN
    RAISE EXCEPTION 'Crating is not allowed for IMPORT mode (case_id=%)', NEW.case_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_contacts; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.account_contacts (
    id text NOT NULL,
    account_id text NOT NULL,
    contact_id text NOT NULL,
    relationship_role text NOT NULL
);


--
-- Name: account_pricing_profiles; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.account_pricing_profiles (
    id text NOT NULL,
    account_id text NOT NULL,
    base_master_tariff_id text NOT NULL,
    currency_override text,
    valid_from timestamp(3) without time zone,
    valid_to timestamp(3) without time zone,
    global_markup_pct numeric(7,4),
    global_discount_pct numeric(7,4),
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    air_markup_pct numeric(7,4),
    air_min_kg numeric(14,4),
    lcl_markup_pct numeric(7,4),
    lcl_min_wm numeric(14,4),
    fcl_markup_pct numeric(7,4),
    local_markup_pct numeric(7,4),
    local_min_hours numeric(14,4),
    local_base_zone_km numeric(14,4),
    local_per_km_rate numeric(14,4),
    local_min_trip_fee numeric(14,4),
    after_hours_multiplier numeric(10,4),
    weekend_multiplier numeric(10,4),
    holiday_multiplier numeric(10,4),
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    code text NOT NULL,
    service_type text,
    service_mode text,
    customer_type text
);


--
-- Name: account_surcharge_policies; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.account_surcharge_policies (
    id text NOT NULL,
    profile_id text NOT NULL,
    surcharge_code text NOT NULL,
    handling osi."AccountSurchargeHandling" NOT NULL,
    override_rate numeric(14,4),
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: accounts; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.accounts (
    id text NOT NULL,
    account_type osi."AccountType" NOT NULL,
    legal_name text NOT NULL,
    tax_id text,
    default_currency text NOT NULL,
    billing_preferences text,
    payment_instructions text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: business_entities; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.business_entities (
    id text NOT NULL,
    code text NOT NULL,
    legal_name text NOT NULL,
    trade_name text,
    entity_kind osi."EntityKind" NOT NULL,
    tax_id text,
    country_code text,
    phone text,
    email text,
    website text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: business_entity_types; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.business_entity_types (
    id text NOT NULL,
    business_entity_id text NOT NULL,
    entity_type_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: case_milestones; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.case_milestones (
    id text NOT NULL,
    case_id text NOT NULL,
    first_response_at timestamp(3) without time zone,
    icp_completed_at timestamp(3) without time zone,
    survey_scheduled_at timestamp(3) without time zone,
    survey_completed_at timestamp(3) without time zone,
    estimate_sent_at timestamp(3) without time zone,
    final_quote_sent_at timestamp(3) without time zone,
    approved_at timestamp(3) without time zone,
    ops_handoff_at timestamp(3) without time zone,
    closed_at timestamp(3) without time zone,
    close_reason text
);


--
-- Name: catalog_assumptions; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.catalog_assumptions (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: catalog_materials; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.catalog_materials (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    unit text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: catalog_service_flags; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.catalog_service_flags (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: catalog_service_types; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.catalog_service_types (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    mode_policy text NOT NULL,
    fixed_mode text,
    active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: catalog_special_handling; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.catalog_special_handling (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: catalog_surcharges; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.catalog_surcharges (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    default_unit text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: code_sequences; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.code_sequences (
    key text NOT NULL,
    value integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: commission_agreements; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.commission_agreements (
    id text NOT NULL,
    business_entity_id text NOT NULL,
    applies_to osi."CommissionAppliesTo" NOT NULL,
    commission_type osi."CommissionType" NOT NULL,
    commission_value numeric(12,2) NOT NULL,
    currency text NOT NULL,
    service_type osi."CommercialServiceType",
    valid_from timestamp(3) without time zone,
    valid_to timestamp(3) without time zone,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.contacts (
    id text NOT NULL,
    full_name text NOT NULL,
    phones jsonb DEFAULT '[]'::jsonb NOT NULL,
    emails jsonb DEFAULT '[]'::jsonb NOT NULL,
    whatsapp text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: crating_requests; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.crating_requests (
    id text NOT NULL,
    case_id text NOT NULL,
    quote_id text,
    status osi."CratingRequestStatus" NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    output_cost_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    generated_line_item_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: entity_contacts; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.entity_contacts (
    id text NOT NULL,
    business_entity_id text NOT NULL,
    full_name text NOT NULL,
    "position" text,
    email text,
    phone text,
    mobile text,
    is_primary boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: entity_types; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.entity_types (
    id text NOT NULL,
    code osi."EntityTypeCode" NOT NULL,
    name text NOT NULL,
    description text
);


--
-- Name: evaluator_article_catalog_snapshots; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.evaluator_article_catalog_snapshots (
    id text NOT NULL,
    version integer NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text
);


--
-- Name: evaluator_visit_reports; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.evaluator_visit_reports (
    id text NOT NULL,
    external_visit_id text NOT NULL,
    case_id text NOT NULL,
    case_code text NOT NULL,
    status text DEFAULT 'SUBMITTED'::text NOT NULL,
    payload_hash text NOT NULL,
    payload jsonb NOT NULL,
    item_count integer DEFAULT 0 NOT NULL,
    piece_count integer DEFAULT 0 NOT NULL,
    photo_count integer DEFAULT 0 NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    received_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    confirmed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    submitted_by text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.events (
    id text NOT NULL,
    case_id text NOT NULL,
    event_type osi."CommercialEventType" NOT NULL,
    start_at timestamp(3) without time zone NOT NULL,
    end_at timestamp(3) without time zone NOT NULL,
    status osi."CommercialEventStatus" DEFAULT 'SCHEDULED'::osi."CommercialEventStatus" NOT NULL,
    assigned_to_contact_id text,
    location_id text,
    notes text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT events_end_after_start_chk CHECK ((end_at >= start_at))
);


--
-- Name: global_commercial_settings; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.global_commercial_settings (
    id text NOT NULL,
    version integer NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    is_scheduled boolean DEFAULT false NOT NULL,
    scheduled_activation_date date,
    activated_at timestamp(3) without time zone,
    activated_by text,
    created_by text NOT NULL,
    km_metro integer NOT NULL,
    km_interior integer NOT NULL,
    tarifa_base numeric(10,2) NOT NULL,
    visit_fee_minimo numeric(10,2) NOT NULL,
    margen_minimo numeric(5,2) NOT NULL,
    hub_principal_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    transport_minimo numeric(10,2) DEFAULT 0 NOT NULL
);


--
-- Name: lead_addresses; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.lead_addresses (
    id text NOT NULL,
    lead_id text NOT NULL,
    address_role osi."AddressRole" NOT NULL,
    country text,
    city text,
    state text,
    postal_code text,
    address_line1 text,
    address_line2 text,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: lead_commissions; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.lead_commissions (
    id text NOT NULL,
    lead_id text NOT NULL,
    referral_entity_id text NOT NULL,
    commission_agreement_id text,
    base_amount numeric(14,2) NOT NULL,
    commission_type osi."CommissionType" NOT NULL,
    commission_value numeric(12,2) NOT NULL,
    commission_amount numeric(14,2) NOT NULL,
    currency text NOT NULL,
    status osi."CommissionStatus" DEFAULT 'PENDING'::osi."CommissionStatus" NOT NULL,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: lead_parties; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.lead_parties (
    id text NOT NULL,
    lead_id text NOT NULL,
    business_entity_id text NOT NULL,
    contact_id text,
    role osi."LeadPartyRole" NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: lead_service_requirements; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.lead_service_requirements (
    id text NOT NULL,
    lead_service_id text NOT NULL,
    requirement_key text NOT NULL,
    status osi."RequirementStatus" DEFAULT 'PENDING'::osi."RequirementStatus" NOT NULL,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: lead_services; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.lead_services (
    id text NOT NULL,
    lead_id text NOT NULL,
    service_type osi."CommercialServiceType" NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    sequence integer,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: lead_stage_history; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.lead_stage_history (
    id text NOT NULL,
    lead_id text NOT NULL,
    from_stage osi."LeadStage",
    to_stage osi."LeadStage" NOT NULL,
    changed_by_user_id text,
    comment text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: location_access_profiles; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.location_access_profiles (
    id text NOT NULL,
    location_id text NOT NULL,
    floor_number integer,
    elevator_available boolean DEFAULT false NOT NULL,
    elevator_notes text,
    stairs_floors integer,
    parking_difficulty osi."ParkingDifficulty" DEFAULT 'MEDIUM'::osi."ParkingDifficulty" NOT NULL,
    long_carry_band osi."LongCarryBand" DEFAULT 'NONE'::osi."LongCarryBand" NOT NULL,
    truck_restrictions text,
    building_rules text,
    risk_notes text,
    photos_asset_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: locations; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.locations (
    id text NOT NULL,
    label text NOT NULL,
    address_line text NOT NULL,
    sector text,
    city text NOT NULL,
    province text,
    country text NOT NULL,
    geo_lat numeric(10,7),
    geo_lng numeric(10,7),
    location_type osi."LocationType" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: master_tariffs; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.master_tariffs (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    scope osi."MasterTariffScope" NOT NULL,
    currency text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    coverage_options jsonb DEFAULT '[]'::jsonb NOT NULL,
    service_rules jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: operational_compensation_configs; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.operational_compensation_configs (
    id text NOT NULL,
    version integer NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text
);


--
-- Name: osi_clients; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_clients (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    address text NOT NULL,
    type text NOT NULL,
    status text NOT NULL,
    "totalServices" integer DEFAULT 0 NOT NULL,
    "lastService" text,
    "createdAt" text NOT NULL,
    "fiscalName" text,
    "taxId" text,
    "billingAddress" text,
    "paymentMethod" text,
    currency text,
    "paymentTerms" text,
    "accountsPayableName" text,
    "accountsPayableEmail" text,
    "accountsPayablePhone" text,
    "complianceNotes" text,
    "kycCompleted" boolean DEFAULT false NOT NULL,
    "normalizedPhone" text,
    "billingTaxId" text,
    "serviceOriginAddress" text,
    "serviceDestinationAddress" text,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_escalation_events; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_escalation_events (
    id text NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    "targetRoles" text[],
    "suggestionId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "resolvedAt" timestamp(3) without time zone,
    "resolvedById" text,
    "metadataJson" jsonb
);


--
-- Name: osi_hubs; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_hubs (
    id text NOT NULL,
    name text NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    active boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_kyc_documents; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_kyc_documents (
    id text NOT NULL,
    "leadId" text,
    "clientId" text,
    type osi."KycDocumentType" NOT NULL,
    url text NOT NULL,
    status osi."KycDocumentStatus" DEFAULT 'UPLOADED'::osi."KycDocumentStatus" NOT NULL,
    note text,
    "uploadedByRole" text,
    "uploadedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "verifiedAt" timestamp(3) without time zone
);


--
-- Name: osi_lead_audit_logs; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_lead_audit_logs (
    id text NOT NULL,
    "leadId" text NOT NULL,
    "actorId" text,
    "actorRole" text NOT NULL,
    action text NOT NULL,
    note text,
    "beforeJson" jsonb,
    "afterJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_lead_volume_estimates; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_lead_volume_estimates (
    id text NOT NULL,
    "leadId" text NOT NULL,
    "areaProfileId" text NOT NULL,
    "estimatedM3Base" double precision NOT NULL,
    "adjustmentPct" double precision DEFAULT 0 NOT NULL,
    "estimatedM3Final" double precision NOT NULL,
    confidence osi."LeadEstimateConfidence" DEFAULT 'MED'::osi."LeadEstimateConfidence" NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedById" text
);


--
-- Name: osi_leads; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_leads (
    id text NOT NULL,
    code text NOT NULL,
    status text NOT NULL,
    "leadType" osi."LeadType",
    channel text,
    "clientName" text NOT NULL,
    phone text,
    email text,
    "preliminaryOriginAddress" text,
    "estimatedServiceType" text,
    "estimatedMoveDate" text,
    "pstCode" text,
    "originAddress" text,
    "destinationAddress" text,
    "originFloor" text,
    "destinationFloor" text,
    "accessType" text,
    "allowedTimeWindow" text,
    "serviceResponsibleName" text,
    "paymentResponsibleName" text,
    "billingCompanyName" text,
    "surveyMethod" text,
    "geoDistanceKm" double precision,
    "geoValidated" boolean DEFAULT false NOT NULL,
    "viaticInformed" boolean DEFAULT false NOT NULL,
    "acceptanceStatus" osi."AcceptanceStatus" DEFAULT 'PENDING'::osi."AcceptanceStatus" NOT NULL,
    "acceptanceEvidence" text,
    "acceptanceNote" text,
    "conversionStatus" osi."LeadConversionStatus" DEFAULT 'PENDING'::osi."LeadConversionStatus" NOT NULL,
    "confirmedServiceDate" text,
    "lostReason" text,
    "lostReasonNote" text,
    "fiscalData" jsonb,
    "kycRequired" boolean DEFAULT false NOT NULL,
    "kycCompleted" boolean DEFAULT false NOT NULL,
    "nestingRequired" boolean DEFAULT false NOT NULL,
    "nestingCompleted" boolean DEFAULT false NOT NULL,
    "fileNumber" text,
    "convertedAt" timestamp(3) without time zone,
    "sentToKAt" timestamp(3) without time zone,
    "gatewayCompletedAt" timestamp(3) without time zone,
    "createdByRole" text,
    "updatedByRole" text,
    "customerId" text,
    "projectId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "surveyRequired" boolean DEFAULT false NOT NULL,
    "surveyStatus" osi."SurveyStatus" DEFAULT 'NOT_STARTED'::osi."SurveyStatus" NOT NULL,
    "surveyCompletedAt" timestamp(3) without time zone,
    "surveyFlagsJson" jsonb,
    "surveySummaryJson" jsonb,
    "originCountryCode" text,
    "destinationCountryCode" text,
    "derivedMode" osi."LeadDerivedMode" DEFAULT 'PENDING'::osi."LeadDerivedMode" NOT NULL,
    "modeUpdatedAt" timestamp(3) without time zone,
    "visitSkipped" boolean DEFAULT false NOT NULL,
    "visitSkipReason" text,
    "visitSkipAt" timestamp(3) without time zone,
    title text,
    source_channel_v2 osi."LeadSourceChannel",
    stage_v2 osi."LeadStage",
    service_scope_v2 osi."CommercialServiceType"
);


--
-- Name: osi_osi_change_logs; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_osi_change_logs (
    id text NOT NULL,
    "osiId" text NOT NULL,
    "actorUserId" text,
    "actorRole" text NOT NULL,
    action text NOT NULL,
    "fieldPath" text,
    "beforeJson" jsonb,
    "afterJson" jsonb,
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_osi_handshakes; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_osi_handshakes (
    id text NOT NULL,
    "osiId" text NOT NULL,
    status osi."OsiHandshakeStatus" DEFAULT 'PENDING'::osi."OsiHandshakeStatus" NOT NULL,
    "fromRole" text NOT NULL,
    "fromUserId" text,
    "toRole" text NOT NULL,
    "toUserId" text,
    type text DEFAULT 'TACTICAL_TRANSFER'::text NOT NULL,
    "timestamp" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone,
    notes text,
    "payloadJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_osi_material_returns; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_osi_material_returns (
    id text NOT NULL,
    "osiId" text NOT NULL,
    "pstCode" text,
    "ptfCode" text,
    "dispatchedJson" jsonb NOT NULL,
    "returnedJson" jsonb NOT NULL,
    "deviationJson" jsonb NOT NULL,
    "recordedById" text,
    "recordedByRole" text,
    "recordedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_osis; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_osis (
    id text NOT NULL,
    code text NOT NULL,
    "projectId" text NOT NULL,
    "projectCode" text NOT NULL,
    "clientId" text NOT NULL,
    "clientName" text NOT NULL,
    status text NOT NULL,
    type text NOT NULL,
    origin text NOT NULL,
    destination text NOT NULL,
    "scheduledDate" text NOT NULL,
    "createdAt" text NOT NULL,
    "assignedTo" text,
    team text[],
    vehicles text[],
    value double precision NOT NULL,
    notes text,
    "custodyStatus" osi."OsiCustodyStatus" DEFAULT 'DRIVER'::osi."OsiCustodyStatus" NOT NULL,
    "custodyTransferredAt" timestamp(3) without time zone,
    "driverAvailable" boolean DEFAULT false NOT NULL,
    "driverId" text,
    "ecoPoints" integer,
    "endedAt" timestamp(3) without time zone,
    kind osi."OsiKind" DEFAULT 'EXTERNAL'::osi."OsiKind" NOT NULL,
    "lastMaterialDeviation" jsonb,
    "npsScore" integer,
    "petCode" text,
    "petEditedManually" boolean DEFAULT false NOT NULL,
    "petPlan" jsonb,
    "pstCode" text,
    "pstTemplateVersionId" text,
    "ptfCode" text,
    "ptfEditedManually" boolean DEFAULT false NOT NULL,
    "ptfMaterialPlan" jsonb,
    "scheduledEndAt" text,
    "scheduledStartAt" text,
    "startedAt" timestamp(3) without time zone,
    "supervisorId" text,
    "supervisorNotes" text,
    "vehicleAvailable" boolean DEFAULT false NOT NULL
);


--
-- Name: osi_pipeline_case_quotes; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_pipeline_case_quotes (
    id text NOT NULL,
    "caseId" text NOT NULL,
    level osi."PipelineQuoteLevel" NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "sentAt" timestamp(3) without time zone,
    "validUntil" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_pipeline_cases; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_pipeline_cases (
    id text NOT NULL,
    "caseCode" text NOT NULL,
    "clientName" text,
    mode osi."PipelineMode" NOT NULL,
    "serviceType" text NOT NULL,
    "customerType" osi."PipelineCustomerType" NOT NULL,
    status osi."PipelineCaseStatus" DEFAULT 'NEW_INBOX'::osi."PipelineCaseStatus" NOT NULL,
    "ownerId" text,
    "ownerName" text NOT NULL,
    "estimatedCbm" double precision DEFAULT 0 NOT NULL,
    "requiresSurvey" boolean DEFAULT false NOT NULL,
    "surveyMethod" osi."PipelineSurveyMethod" DEFAULT 'NO_APLICA'::osi."PipelineSurveyMethod" NOT NULL,
    flags text[] DEFAULT ARRAY[]::text[],
    "milestonesJson" jsonb,
    "originLocation" text NOT NULL,
    "destinationLocation" text NOT NULL,
    "destinationContracted" boolean DEFAULT true NOT NULL,
    "destinationOverrideType" text,
    "destinationAcceptanceUploaded" boolean DEFAULT false NOT NULL,
    "noDestinationCaseType" text,
    "assetsCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_pipeline_crating_requests; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_pipeline_crating_requests (
    id text NOT NULL,
    "caseId" text NOT NULL,
    code text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "estimateReady" boolean DEFAULT false NOT NULL,
    "payloadJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_pipeline_events; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_pipeline_events (
    id text NOT NULL,
    "caseId" text NOT NULL,
    "eventType" osi."PipelineEventType" NOT NULL,
    status osi."PipelineEventStatus" DEFAULT 'PENDING'::osi."PipelineEventStatus" NOT NULL,
    "startAt" timestamp(3) without time zone NOT NULL,
    code text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_project_coordination; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_project_coordination (
    id text NOT NULL,
    project_id text NOT NULL,
    status text NOT NULL,
    requirements_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    milestones_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    documents_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: osi_project_coordination_communications; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_project_coordination_communications (
    id text NOT NULL,
    coordination_id text NOT NULL,
    template_key text NOT NULL,
    channel text NOT NULL,
    subject text,
    content text NOT NULL,
    recipient_name text,
    recipient_email text,
    sent_by_id text,
    sent_by_role text,
    sent_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_project_pgd; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_project_pgd (
    id text NOT NULL,
    "projectId" text NOT NULL,
    "templateId" text NOT NULL,
    "templateVersionId" text NOT NULL,
    "appliedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "appliedById" text
);


--
-- Name: osi_project_pgd_items; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_project_pgd_items (
    id text NOT NULL,
    "projectPgdId" text NOT NULL,
    name text NOT NULL,
    visibility osi."PgdVisibility" NOT NULL,
    responsible osi."PgdResponsible" NOT NULL,
    "isBlocking" boolean DEFAULT false NOT NULL,
    "expectedFileType" osi."PgdFileType" DEFAULT 'OTHER'::osi."PgdFileType" NOT NULL,
    "serviceTags" text[],
    status osi."PgdItemStatus" DEFAULT 'MISSING'::osi."PgdItemStatus" NOT NULL,
    "validatedAt" timestamp(3) without time zone,
    "validatedById" text,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: osi_project_signals; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_project_signals (
    id text NOT NULL,
    "projectId" text NOT NULL,
    kind osi."SignalKind" NOT NULL,
    policy osi."SignalPolicy" NOT NULL,
    "warnAt" timestamp(3) without time zone,
    "dueAt" timestamp(3) without time zone,
    "doneAt" timestamp(3) without time zone,
    "ackAt" timestamp(3) without time zone,
    "ackNote" text,
    "ackById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: osi_projects; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_projects (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "clientId" text NOT NULL,
    "clientName" text NOT NULL,
    status text NOT NULL,
    "startDate" text NOT NULL,
    "endDate" text,
    "osiCount" integer DEFAULT 0 NOT NULL,
    "totalValue" double precision DEFAULT 0 NOT NULL,
    "assignedTo" text,
    notes text,
    "kReleasedAt" timestamp(3) without time zone,
    "kState" osi."ProjectKState" DEFAULT 'PENDING_VALIDATION'::osi."ProjectKState" NOT NULL,
    "kValidatedAt" timestamp(3) without time zone,
    "leadId" text,
    "pstCode" text,
    "pstServiceName" text,
    "quoteId" text,
    "fileNumber" text
);


--
-- Name: osi_ptf_adjustment_suggestions; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_ptf_adjustment_suggestions (
    id text NOT NULL,
    "pstCode" text NOT NULL,
    "ptfCode" text,
    status osi."PtfSuggestionStatus" DEFAULT 'PENDING'::osi."PtfSuggestionStatus" NOT NULL,
    "basedOnOsiIds" text[],
    occurrences integer DEFAULT 0 NOT NULL,
    "recommendedDelta" jsonb NOT NULL,
    reason text,
    "ignoredCount" integer DEFAULT 0 NOT NULL,
    "lastIgnoredAt" timestamp(3) without time zone,
    "lastActionById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: osi_survey_item_nesting; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_survey_item_nesting (
    id text NOT NULL,
    "surveyItemId" text NOT NULL,
    "realLength" double precision,
    "realWidth" double precision,
    "realHeight" double precision,
    unit osi."SurveyDimensionUnit" DEFAULT 'CM'::osi."SurveyDimensionUnit" NOT NULL,
    "technicalNote" text,
    "ispm15Required" boolean DEFAULT false NOT NULL,
    "fragileTier" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_survey_items; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_survey_items (
    id text NOT NULL,
    "surveyId" text NOT NULL,
    "roomId" text,
    "itemRef" text,
    "itemName" text,
    quantity integer DEFAULT 1 NOT NULL,
    "packLevel" osi."SurveyPackLevel" DEFAULT 'P1'::osi."SurveyPackLevel" NOT NULL,
    "needsDisassembly" boolean DEFAULT false NOT NULL,
    notes text,
    "unitVolume" double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_survey_media; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_survey_media (
    id text NOT NULL,
    "surveyId" text NOT NULL,
    "surveyItemId" text,
    type osi."SurveyMediaType" DEFAULT 'OTHER'::osi."SurveyMediaType" NOT NULL,
    url text NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_survey_rooms; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_survey_rooms (
    id text NOT NULL,
    "surveyId" text NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_survey_signatures; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_survey_signatures (
    id text NOT NULL,
    "surveyId" text NOT NULL,
    "signerName" text,
    "acceptedDigital" boolean DEFAULT false NOT NULL,
    "signatureDataUrl" text,
    "signatureNote" text,
    "signedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_survey_site_access; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_survey_site_access (
    id text NOT NULL,
    "surveyId" text NOT NULL,
    "propertyType" osi."SurveyPropertyType",
    "floorLevel" integer,
    "elevatorAvailableForMove" boolean,
    "elevatorDims" jsonb,
    "stairsType" osi."SurveyStairsType",
    "stairsWidthOk" boolean,
    "truckParkingDistanceM" double precision,
    "timeRestrictionsForTrucks" boolean,
    "timeRestrictionsNote" text,
    "permitsRequired" text[],
    "permitsEvidenceProvided" boolean DEFAULT false NOT NULL,
    "permitsTaskCreated" boolean DEFAULT false NOT NULL,
    "longCarry" boolean DEFAULT false NOT NULL,
    "stairCarryRisk" boolean DEFAULT false NOT NULL,
    "needsPermits" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_surveys; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_surveys (
    id text NOT NULL,
    "leadId" text NOT NULL,
    "clientId" text,
    "projectId" text,
    type osi."SurveyType" DEFAULT 'PRESENCIAL'::osi."SurveyType" NOT NULL,
    status osi."SurveyStatus" DEFAULT 'IN_PROGRESS'::osi."SurveyStatus" NOT NULL,
    "inspectorUserId" text,
    "originAddressId" text,
    "checkInGps" jsonb,
    "checkInAt" timestamp(3) without time zone,
    "submittedAt" timestamp(3) without time zone,
    "estimatedTotalVolume" double precision,
    "volumeUnit" text,
    "prohibitedItemsAcknowledged" boolean DEFAULT false NOT NULL,
    "riskNotes" text,
    "longCarry" boolean DEFAULT false NOT NULL,
    "stairCarryRisk" boolean DEFAULT false NOT NULL,
    "needsPermits" boolean DEFAULT false NOT NULL,
    "needsCratingCount" integer DEFAULT 0 NOT NULL,
    "packP1Count" integer DEFAULT 0 NOT NULL,
    "packP2Count" integer DEFAULT 0 NOT NULL,
    "packP3Count" integer DEFAULT 0 NOT NULL,
    "flagsJson" jsonb,
    "summaryJson" jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: osi_template_versions; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_template_versions (
    id text NOT NULL,
    "templateId" text NOT NULL,
    version integer NOT NULL,
    status osi."TemplateVersionStatus" DEFAULT 'DRAFT'::osi."TemplateVersionStatus" NOT NULL,
    "contentJson" jsonb,
    "contentHtml" text,
    "changeSummary" text,
    "requestedAt" timestamp(3) without time zone,
    "approvedAt" timestamp(3) without time zone,
    "publishedAt" timestamp(3) without time zone,
    "createdById" text NOT NULL,
    "approvedById" text,
    "rejectedById" text,
    "baseVersionId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: osi_templates; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_templates (
    id text NOT NULL,
    type osi."TemplateType" NOT NULL,
    name text NOT NULL,
    scope osi."TemplateScope" DEFAULT 'TENANT'::osi."TemplateScope" NOT NULL,
    "tenantId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "publishedVersionId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: osi_tipos_servicio_config; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_tipos_servicio_config (
    id text NOT NULL,
    "serviceKey" text NOT NULL,
    "modePolicy" osi."LeadModePolicy" DEFAULT 'FIXED'::osi."LeadModePolicy" NOT NULL,
    "fixedMode" osi."ServiceMode",
    "surveyRule" osi."SurveyRule" DEFAULT 'OPTIONAL'::osi."SurveyRule" NOT NULL,
    "surveyThresholdM3" double precision,
    "enableModules" jsonb,
    active boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedById" text
);


--
-- Name: osi_users; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_users (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    role text NOT NULL,
    status text NOT NULL,
    department text,
    "joinDate" text NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    rating double precision DEFAULT 0 NOT NULL,
    "passwordHash" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "profilePhotoUrl" text,
    "employeeProfile" jsonb
);


--
-- Name: osi_volume_area_profiles; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.osi_volume_area_profiles (
    id text NOT NULL,
    name text NOT NULL,
    "defaultM3" double precision NOT NULL,
    "minM3" double precision NOT NULL,
    "maxM3" double precision NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedById" text
);


--
-- Name: quote_addendums; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.quote_addendums (
    id text NOT NULL,
    quote_id text NOT NULL,
    base_version integer NOT NULL,
    addendum_number integer NOT NULL,
    description text NOT NULL,
    amount_delta double precision NOT NULL,
    currency text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by text NOT NULL,
    base_approved_amount double precision,
    cap_percent double precision DEFAULT 15 NOT NULL,
    financial_nature text DEFAULT 'CUSTOMER_REVENUE'::text NOT NULL,
    service_classification text DEFAULT 'SCOPE_ADDITION'::text NOT NULL,
    invoice_treatment text DEFAULT 'ADDITIONAL_LINE'::text NOT NULL,
    invoice_line_description text,
    billing_status text DEFAULT 'PENDING_INVOICE'::text NOT NULL,
    invoice_reference text,
    acceptance_json jsonb,
    evidence_json jsonb,
    operational_adjustment_json jsonb,
    approved_at timestamp(3) without time zone
);


--
-- Name: quote_line_items; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.quote_line_items (
    id text NOT NULL,
    quote_id text NOT NULL,
    block osi."QuoteBlock" NOT NULL,
    item_type osi."QuoteItemType" NOT NULL,
    catalog_code text,
    description text NOT NULL,
    qty numeric(12,3) NOT NULL,
    unit text NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    total numeric(14,2) NOT NULL,
    evidence_required boolean DEFAULT false NOT NULL,
    notes text
);


--
-- Name: quote_versions; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.quote_versions (
    id text NOT NULL,
    quote_id text NOT NULL,
    version_number integer NOT NULL,
    data jsonb NOT NULL,
    hub_snapshot text,
    vehicle_snapshot text,
    zone_origin_snapshot text,
    zone_destination_snapshot text,
    km_rate_snapshot double precision,
    free_km_snapshot double precision,
    surcharge_snapshot double precision,
    sla_snapshot integer,
    margin_snapshot double precision,
    engine_flags_snapshot jsonb,
    operational_volume_total double precision,
    operational_volume_source text,
    selected_shipping_method text,
    operational_volume_snapshot jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by text NOT NULL
);


--
-- Name: quotes; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.quotes (
    id text NOT NULL,
    case_id text NOT NULL,
    level osi."QuoteLevel" NOT NULL,
    version integer NOT NULL,
    status osi."QuoteStatus" NOT NULL,
    currency text NOT NULL,
    payment_terms_text text,
    assumptions_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    exclusions_text text,
    change_control_text text,
    sent_at timestamp(3) without time zone,
    valid_until timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: service_cases; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.service_cases (
    id text NOT NULL,
    case_code text NOT NULL,
    mode osi."ServiceCaseMode" NOT NULL,
    service_type text NOT NULL,
    customer_type osi."ServiceCaseCustomerType" NOT NULL,
    status osi."ServiceCaseStatus" NOT NULL,
    owner_contact_id text,
    account_id text,
    primary_contact_id text NOT NULL,
    payer_contact_id text,
    approver_contact_id text,
    origin_location_id text NOT NULL,
    destination_location_id text,
    blocks jsonb DEFAULT '{}'::jsonb NOT NULL,
    no_destination_case_type osi."NoDestinationCaseType",
    no_destination_ack_asset_id text,
    estimated_cbm numeric(12,3),
    survey_method osi."SurveyMethod",
    requires_survey boolean DEFAULT false NOT NULL,
    service_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT service_cases_case_b_requires_destination_chk CHECK (((no_destination_case_type IS NULL) OR (no_destination_case_type <> 'CASE_B_ORIGIN_STORAGE'::osi."NoDestinationCaseType") OR (destination_location_id IS NOT NULL))),
    CONSTRAINT service_cases_case_c_requires_ack_chk CHECK (((no_destination_case_type IS NULL) OR (no_destination_case_type <> 'CASE_C_PICKUP_NO_DELIVERY'::osi."NoDestinationCaseType") OR (no_destination_ack_asset_id IS NOT NULL))),
    CONSTRAINT service_cases_transport_requires_destination_chk CHECK (((COALESCE(((blocks ->> 'transport'::text))::boolean, false) = false) OR (destination_location_id IS NOT NULL)))
);


--
-- Name: surcharge_catalog; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.surcharge_catalog (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    default_pricing_mode osi."SurchargePricingMode" NOT NULL,
    default_rate numeric(14,4) NOT NULL,
    currency text NOT NULL,
    applies_to jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: surveys; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.surveys (
    id text NOT NULL,
    case_id text NOT NULL,
    survey_type text NOT NULL,
    performed_at timestamp(3) without time zone NOT NULL,
    performed_by_contact_id text,
    origin_access_confirmed boolean DEFAULT false NOT NULL,
    destination_access_confirmed boolean DEFAULT false NOT NULL,
    volume_estimate text,
    inventory_summary text,
    special_handling_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    surcharges_possible_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    assumptions_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence_asset_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tariff_overrides; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.tariff_overrides (
    id text NOT NULL,
    profile_id text NOT NULL,
    scope osi."TariffOverrideScope" NOT NULL,
    mode osi."TariffRateMode",
    route_key text,
    key text NOT NULL,
    value jsonb NOT NULL,
    notes text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: tariff_rate_bands; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.tariff_rate_bands (
    id text NOT NULL,
    rate_set_id text NOT NULL,
    from_value numeric(14,4) NOT NULL,
    to_value numeric(14,4),
    rate numeric(14,4) NOT NULL,
    fixed_fee numeric(14,4),
    unit text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: tariff_rate_sets; Type: TABLE; Schema: osi; Owner: -
--

CREATE TABLE osi.tariff_rate_sets (
    id text NOT NULL,
    master_tariff_id text NOT NULL,
    mode osi."TariffRateMode" NOT NULL,
    measurement_system text NOT NULL,
    density_reference numeric(12,4),
    minimum_charge numeric(14,4),
    base_fee numeric(14,4),
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: CratePlan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CratePlan" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "createdById" text NOT NULL,
    instructions text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "approvedAt" timestamp(3) without time zone,
    "approvedBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "destinationType" text NOT NULL,
    "estimatedPlywood" integer,
    "estimatedWoodBf" numeric(65,30),
    "extHcm" integer NOT NULL,
    "extLcm" integer NOT NULL,
    "extWcm" integer NOT NULL,
    "nimf15Required" boolean DEFAULT false NOT NULL
);


--
-- Name: CratePlanItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CratePlanItem" (
    id text NOT NULL,
    "cratePlanId" text NOT NULL,
    name text NOT NULL,
    lcm integer NOT NULL,
    wcm integer NOT NULL,
    hcm integer NOT NULL,
    "weightKg" numeric(65,30),
    fragility text NOT NULL,
    "allowRotation" boolean DEFAULT true NOT NULL,
    stackable boolean DEFAULT true NOT NULL,
    "paddingCm" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Invitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Invitation" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    "shabCodes" jsonb,
    token text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "acceptedAt" timestamp(3) without time zone,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Membership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Membership" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    role text NOT NULL,
    "shabCodes" jsonb,
    "hourlyRate" numeric(65,30)
);


--
-- Name: Project; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Project" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL
);


--
-- Name: Tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tenant" (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    features jsonb,
    settings jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    name text,
    "photoUrl" text,
    "passwordHash" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: account_contacts account_contacts_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.account_contacts
    ADD CONSTRAINT account_contacts_pkey PRIMARY KEY (id);


--
-- Name: account_pricing_profiles account_pricing_profiles_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.account_pricing_profiles
    ADD CONSTRAINT account_pricing_profiles_pkey PRIMARY KEY (id);


--
-- Name: account_surcharge_policies account_surcharge_policies_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.account_surcharge_policies
    ADD CONSTRAINT account_surcharge_policies_pkey PRIMARY KEY (id);


--
-- Name: account_surcharge_policies account_surcharge_policies_profile_id_surcharge_code_key; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.account_surcharge_policies
    ADD CONSTRAINT account_surcharge_policies_profile_id_surcharge_code_key UNIQUE (profile_id, surcharge_code);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: business_entities business_entities_code_key; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.business_entities
    ADD CONSTRAINT business_entities_code_key UNIQUE (code);


--
-- Name: business_entities business_entities_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.business_entities
    ADD CONSTRAINT business_entities_pkey PRIMARY KEY (id);


--
-- Name: business_entity_types business_entity_types_business_entity_id_entity_type_id_key; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.business_entity_types
    ADD CONSTRAINT business_entity_types_business_entity_id_entity_type_id_key UNIQUE (business_entity_id, entity_type_id);


--
-- Name: business_entity_types business_entity_types_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.business_entity_types
    ADD CONSTRAINT business_entity_types_pkey PRIMARY KEY (id);


--
-- Name: case_milestones case_milestones_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.case_milestones
    ADD CONSTRAINT case_milestones_pkey PRIMARY KEY (id);


--
-- Name: catalog_assumptions catalog_assumptions_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.catalog_assumptions
    ADD CONSTRAINT catalog_assumptions_pkey PRIMARY KEY (id);


--
-- Name: catalog_materials catalog_materials_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.catalog_materials
    ADD CONSTRAINT catalog_materials_pkey PRIMARY KEY (id);


--
-- Name: catalog_service_flags catalog_service_flags_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.catalog_service_flags
    ADD CONSTRAINT catalog_service_flags_pkey PRIMARY KEY (id);


--
-- Name: catalog_service_types catalog_service_types_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.catalog_service_types
    ADD CONSTRAINT catalog_service_types_pkey PRIMARY KEY (id);


--
-- Name: catalog_special_handling catalog_special_handling_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.catalog_special_handling
    ADD CONSTRAINT catalog_special_handling_pkey PRIMARY KEY (id);


--
-- Name: catalog_surcharges catalog_surcharges_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.catalog_surcharges
    ADD CONSTRAINT catalog_surcharges_pkey PRIMARY KEY (id);


--
-- Name: code_sequences code_sequences_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.code_sequences
    ADD CONSTRAINT code_sequences_pkey PRIMARY KEY (key);


--
-- Name: commission_agreements commission_agreements_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.commission_agreements
    ADD CONSTRAINT commission_agreements_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: crating_requests crating_requests_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.crating_requests
    ADD CONSTRAINT crating_requests_pkey PRIMARY KEY (id);


--
-- Name: entity_contacts entity_contacts_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.entity_contacts
    ADD CONSTRAINT entity_contacts_pkey PRIMARY KEY (id);


--
-- Name: entity_types entity_types_code_key; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.entity_types
    ADD CONSTRAINT entity_types_code_key UNIQUE (code);


--
-- Name: entity_types entity_types_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.entity_types
    ADD CONSTRAINT entity_types_pkey PRIMARY KEY (id);


--
-- Name: evaluator_article_catalog_snapshots evaluator_article_catalog_snapshots_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.evaluator_article_catalog_snapshots
    ADD CONSTRAINT evaluator_article_catalog_snapshots_pkey PRIMARY KEY (id);


--
-- Name: evaluator_visit_reports evaluator_visit_reports_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.evaluator_visit_reports
    ADD CONSTRAINT evaluator_visit_reports_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: global_commercial_settings global_commercial_settings_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.global_commercial_settings
    ADD CONSTRAINT global_commercial_settings_pkey PRIMARY KEY (id);


--
-- Name: lead_addresses lead_addresses_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_addresses
    ADD CONSTRAINT lead_addresses_pkey PRIMARY KEY (id);


--
-- Name: lead_commissions lead_commissions_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_commissions
    ADD CONSTRAINT lead_commissions_pkey PRIMARY KEY (id);


--
-- Name: lead_parties lead_parties_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_parties
    ADD CONSTRAINT lead_parties_pkey PRIMARY KEY (id);


--
-- Name: lead_service_requirements lead_service_requirements_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_service_requirements
    ADD CONSTRAINT lead_service_requirements_pkey PRIMARY KEY (id);


--
-- Name: lead_services lead_services_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_services
    ADD CONSTRAINT lead_services_pkey PRIMARY KEY (id);


--
-- Name: lead_stage_history lead_stage_history_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_stage_history
    ADD CONSTRAINT lead_stage_history_pkey PRIMARY KEY (id);


--
-- Name: location_access_profiles location_access_profiles_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.location_access_profiles
    ADD CONSTRAINT location_access_profiles_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: master_tariffs master_tariffs_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.master_tariffs
    ADD CONSTRAINT master_tariffs_pkey PRIMARY KEY (id);


--
-- Name: operational_compensation_configs operational_compensation_configs_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.operational_compensation_configs
    ADD CONSTRAINT operational_compensation_configs_pkey PRIMARY KEY (id);


--
-- Name: osi_clients osi_clients_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_clients
    ADD CONSTRAINT osi_clients_pkey PRIMARY KEY (id);


--
-- Name: osi_escalation_events osi_escalation_events_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_escalation_events
    ADD CONSTRAINT osi_escalation_events_pkey PRIMARY KEY (id);


--
-- Name: osi_hubs osi_hubs_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_hubs
    ADD CONSTRAINT osi_hubs_pkey PRIMARY KEY (id);


--
-- Name: osi_kyc_documents osi_kyc_documents_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_kyc_documents
    ADD CONSTRAINT osi_kyc_documents_pkey PRIMARY KEY (id);


--
-- Name: osi_lead_audit_logs osi_lead_audit_logs_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_lead_audit_logs
    ADD CONSTRAINT osi_lead_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: osi_lead_volume_estimates osi_lead_volume_estimates_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_lead_volume_estimates
    ADD CONSTRAINT osi_lead_volume_estimates_pkey PRIMARY KEY (id);


--
-- Name: osi_leads osi_leads_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_leads
    ADD CONSTRAINT osi_leads_pkey PRIMARY KEY (id);


--
-- Name: osi_osi_change_logs osi_osi_change_logs_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_osi_change_logs
    ADD CONSTRAINT osi_osi_change_logs_pkey PRIMARY KEY (id);


--
-- Name: osi_osi_handshakes osi_osi_handshakes_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_osi_handshakes
    ADD CONSTRAINT osi_osi_handshakes_pkey PRIMARY KEY (id);


--
-- Name: osi_osi_material_returns osi_osi_material_returns_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_osi_material_returns
    ADD CONSTRAINT osi_osi_material_returns_pkey PRIMARY KEY (id);


--
-- Name: osi_osis osi_osis_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_osis
    ADD CONSTRAINT osi_osis_pkey PRIMARY KEY (id);


--
-- Name: osi_pipeline_case_quotes osi_pipeline_case_quotes_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_pipeline_case_quotes
    ADD CONSTRAINT osi_pipeline_case_quotes_pkey PRIMARY KEY (id);


--
-- Name: osi_pipeline_cases osi_pipeline_cases_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_pipeline_cases
    ADD CONSTRAINT osi_pipeline_cases_pkey PRIMARY KEY (id);


--
-- Name: osi_pipeline_crating_requests osi_pipeline_crating_requests_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_pipeline_crating_requests
    ADD CONSTRAINT osi_pipeline_crating_requests_pkey PRIMARY KEY (id);


--
-- Name: osi_pipeline_events osi_pipeline_events_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_pipeline_events
    ADD CONSTRAINT osi_pipeline_events_pkey PRIMARY KEY (id);


--
-- Name: osi_project_coordination_communications osi_project_coordination_communications_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_coordination_communications
    ADD CONSTRAINT osi_project_coordination_communications_pkey PRIMARY KEY (id);


--
-- Name: osi_project_coordination osi_project_coordination_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_coordination
    ADD CONSTRAINT osi_project_coordination_pkey PRIMARY KEY (id);


--
-- Name: osi_project_pgd_items osi_project_pgd_items_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_pgd_items
    ADD CONSTRAINT osi_project_pgd_items_pkey PRIMARY KEY (id);


--
-- Name: osi_project_pgd osi_project_pgd_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_pgd
    ADD CONSTRAINT osi_project_pgd_pkey PRIMARY KEY (id);


--
-- Name: osi_project_signals osi_project_signals_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_signals
    ADD CONSTRAINT osi_project_signals_pkey PRIMARY KEY (id);


--
-- Name: osi_projects osi_projects_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_projects
    ADD CONSTRAINT osi_projects_pkey PRIMARY KEY (id);


--
-- Name: osi_ptf_adjustment_suggestions osi_ptf_adjustment_suggestions_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_ptf_adjustment_suggestions
    ADD CONSTRAINT osi_ptf_adjustment_suggestions_pkey PRIMARY KEY (id);


--
-- Name: osi_survey_item_nesting osi_survey_item_nesting_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_item_nesting
    ADD CONSTRAINT osi_survey_item_nesting_pkey PRIMARY KEY (id);


--
-- Name: osi_survey_items osi_survey_items_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_items
    ADD CONSTRAINT osi_survey_items_pkey PRIMARY KEY (id);


--
-- Name: osi_survey_media osi_survey_media_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_media
    ADD CONSTRAINT osi_survey_media_pkey PRIMARY KEY (id);


--
-- Name: osi_survey_rooms osi_survey_rooms_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_rooms
    ADD CONSTRAINT osi_survey_rooms_pkey PRIMARY KEY (id);


--
-- Name: osi_survey_signatures osi_survey_signatures_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_signatures
    ADD CONSTRAINT osi_survey_signatures_pkey PRIMARY KEY (id);


--
-- Name: osi_survey_site_access osi_survey_site_access_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_site_access
    ADD CONSTRAINT osi_survey_site_access_pkey PRIMARY KEY (id);


--
-- Name: osi_surveys osi_surveys_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_surveys
    ADD CONSTRAINT osi_surveys_pkey PRIMARY KEY (id);


--
-- Name: osi_template_versions osi_template_versions_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_template_versions
    ADD CONSTRAINT osi_template_versions_pkey PRIMARY KEY (id);


--
-- Name: osi_templates osi_templates_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_templates
    ADD CONSTRAINT osi_templates_pkey PRIMARY KEY (id);


--
-- Name: osi_tipos_servicio_config osi_tipos_servicio_config_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_tipos_servicio_config
    ADD CONSTRAINT osi_tipos_servicio_config_pkey PRIMARY KEY (id);


--
-- Name: osi_users osi_users_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_users
    ADD CONSTRAINT osi_users_pkey PRIMARY KEY (id);


--
-- Name: osi_volume_area_profiles osi_volume_area_profiles_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_volume_area_profiles
    ADD CONSTRAINT osi_volume_area_profiles_pkey PRIMARY KEY (id);


--
-- Name: quote_addendums quote_addendums_amount_delta_positive; Type: CHECK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE osi.quote_addendums
    ADD CONSTRAINT quote_addendums_amount_delta_positive CHECK ((amount_delta > (0)::double precision)) NOT VALID;


--
-- Name: quote_addendums quote_addendums_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.quote_addendums
    ADD CONSTRAINT quote_addendums_pkey PRIMARY KEY (id);


--
-- Name: quote_line_items quote_line_items_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.quote_line_items
    ADD CONSTRAINT quote_line_items_pkey PRIMARY KEY (id);


--
-- Name: quote_versions quote_versions_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.quote_versions
    ADD CONSTRAINT quote_versions_pkey PRIMARY KEY (id);


--
-- Name: quotes quotes_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);


--
-- Name: service_cases service_cases_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.service_cases
    ADD CONSTRAINT service_cases_pkey PRIMARY KEY (id);


--
-- Name: surcharge_catalog surcharge_catalog_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.surcharge_catalog
    ADD CONSTRAINT surcharge_catalog_pkey PRIMARY KEY (id);


--
-- Name: surveys surveys_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.surveys
    ADD CONSTRAINT surveys_pkey PRIMARY KEY (id);


--
-- Name: tariff_overrides tariff_overrides_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.tariff_overrides
    ADD CONSTRAINT tariff_overrides_pkey PRIMARY KEY (id);


--
-- Name: tariff_rate_bands tariff_rate_bands_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.tariff_rate_bands
    ADD CONSTRAINT tariff_rate_bands_pkey PRIMARY KEY (id);


--
-- Name: tariff_rate_sets tariff_rate_sets_pkey; Type: CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.tariff_rate_sets
    ADD CONSTRAINT tariff_rate_sets_pkey PRIMARY KEY (id);


--
-- Name: CratePlanItem CratePlanItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CratePlanItem"
    ADD CONSTRAINT "CratePlanItem_pkey" PRIMARY KEY (id);


--
-- Name: CratePlan CratePlan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CratePlan"
    ADD CONSTRAINT "CratePlan_pkey" PRIMARY KEY (id);


--
-- Name: Invitation Invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_pkey" PRIMARY KEY (id);


--
-- Name: Membership Membership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_pkey" PRIMARY KEY (id);


--
-- Name: Project Project_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_pkey" PRIMARY KEY (id);


--
-- Name: Tenant Tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tenant"
    ADD CONSTRAINT "Tenant_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: account_contacts_account_id_contact_id_relationship_role_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX account_contacts_account_id_contact_id_relationship_role_key ON osi.account_contacts USING btree (account_id, contact_id, relationship_role);


--
-- Name: account_pricing_profiles_account_id_is_active_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX account_pricing_profiles_account_id_is_active_idx ON osi.account_pricing_profiles USING btree (account_id, is_active);


--
-- Name: account_pricing_profiles_base_master_tariff_id_is_active_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX account_pricing_profiles_base_master_tariff_id_is_active_idx ON osi.account_pricing_profiles USING btree (base_master_tariff_id, is_active);


--
-- Name: account_pricing_profiles_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX account_pricing_profiles_code_key ON osi.account_pricing_profiles USING btree (code);


--
-- Name: account_pricing_profiles_service_type_service_mode_customer_typ; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX account_pricing_profiles_service_type_service_mode_customer_typ ON osi.account_pricing_profiles USING btree (service_type, service_mode, customer_type, is_active);


--
-- Name: account_surcharge_policies_surcharge_code_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX account_surcharge_policies_surcharge_code_idx ON osi.account_surcharge_policies USING btree (surcharge_code);


--
-- Name: business_entities_entity_kind_is_active_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX business_entities_entity_kind_is_active_idx ON osi.business_entities USING btree (entity_kind, is_active);


--
-- Name: business_entities_legal_name_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX business_entities_legal_name_idx ON osi.business_entities USING btree (legal_name);


--
-- Name: business_entity_types_entity_type_id_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX business_entity_types_entity_type_id_idx ON osi.business_entity_types USING btree (entity_type_id);


--
-- Name: case_milestones_case_id_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX case_milestones_case_id_key ON osi.case_milestones USING btree (case_id);


--
-- Name: case_milestones_final_quote_sent_at_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX case_milestones_final_quote_sent_at_idx ON osi.case_milestones USING btree (final_quote_sent_at);


--
-- Name: case_milestones_first_response_at_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX case_milestones_first_response_at_idx ON osi.case_milestones USING btree (first_response_at);


--
-- Name: catalog_assumptions_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX catalog_assumptions_code_key ON osi.catalog_assumptions USING btree (code);


--
-- Name: catalog_materials_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX catalog_materials_code_key ON osi.catalog_materials USING btree (code);


--
-- Name: catalog_service_flags_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX catalog_service_flags_code_key ON osi.catalog_service_flags USING btree (code);


--
-- Name: catalog_service_types_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX catalog_service_types_code_key ON osi.catalog_service_types USING btree (code);


--
-- Name: catalog_special_handling_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX catalog_special_handling_code_key ON osi.catalog_special_handling USING btree (code);


--
-- Name: catalog_surcharges_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX catalog_surcharges_code_key ON osi.catalog_surcharges USING btree (code);


--
-- Name: commission_agreements_business_entity_id_is_active_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX commission_agreements_business_entity_id_is_active_idx ON osi.commission_agreements USING btree (business_entity_id, is_active);


--
-- Name: entity_contacts_business_entity_id_is_primary_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX entity_contacts_business_entity_id_is_primary_idx ON osi.entity_contacts USING btree (business_entity_id, is_primary);


--
-- Name: evaluator_visit_reports_case_id_confirmed_at_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX evaluator_visit_reports_case_id_confirmed_at_idx ON osi.evaluator_visit_reports USING btree (case_id, confirmed_at);


--
-- Name: evaluator_visit_reports_external_visit_id_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX evaluator_visit_reports_external_visit_id_key ON osi.evaluator_visit_reports USING btree (external_visit_id);


--
-- Name: evaluator_visit_reports_status_confirmed_at_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX evaluator_visit_reports_status_confirmed_at_idx ON osi.evaluator_visit_reports USING btree (status, confirmed_at);


--
-- Name: events_case_id_event_type_start_at_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX events_case_id_event_type_start_at_idx ON osi.events USING btree (case_id, event_type, start_at);


--
-- Name: global_commercial_settings_is_active_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX global_commercial_settings_is_active_idx ON osi.global_commercial_settings USING btree (is_active);


--
-- Name: global_commercial_settings_is_scheduled_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX global_commercial_settings_is_scheduled_idx ON osi.global_commercial_settings USING btree (is_scheduled);


--
-- Name: global_commercial_settings_version_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX global_commercial_settings_version_idx ON osi.global_commercial_settings USING btree (version);


--
-- Name: lead_addresses_lead_id_address_role_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX lead_addresses_lead_id_address_role_idx ON osi.lead_addresses USING btree (lead_id, address_role);


--
-- Name: lead_commissions_lead_id_status_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX lead_commissions_lead_id_status_idx ON osi.lead_commissions USING btree (lead_id, status);


--
-- Name: lead_commissions_referral_entity_id_status_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX lead_commissions_referral_entity_id_status_idx ON osi.lead_commissions USING btree (referral_entity_id, status);


--
-- Name: lead_parties_business_entity_id_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX lead_parties_business_entity_id_idx ON osi.lead_parties USING btree (business_entity_id);


--
-- Name: lead_parties_contact_id_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX lead_parties_contact_id_idx ON osi.lead_parties USING btree (contact_id);


--
-- Name: lead_parties_lead_id_role_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX lead_parties_lead_id_role_idx ON osi.lead_parties USING btree (lead_id, role);


--
-- Name: lead_service_requirements_lead_service_id_status_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX lead_service_requirements_lead_service_id_status_idx ON osi.lead_service_requirements USING btree (lead_service_id, status);


--
-- Name: lead_services_lead_id_service_type_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX lead_services_lead_id_service_type_idx ON osi.lead_services USING btree (lead_id, service_type);


--
-- Name: lead_stage_history_lead_id_created_at_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX lead_stage_history_lead_id_created_at_idx ON osi.lead_stage_history USING btree (lead_id, created_at);


--
-- Name: lead_stage_history_to_stage_created_at_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX lead_stage_history_to_stage_created_at_idx ON osi.lead_stage_history USING btree (to_stage, created_at);


--
-- Name: location_access_profiles_location_id_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX location_access_profiles_location_id_key ON osi.location_access_profiles USING btree (location_id);


--
-- Name: locations_city_sector_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX locations_city_sector_idx ON osi.locations USING btree (city, sector);


--
-- Name: master_tariffs_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX master_tariffs_code_key ON osi.master_tariffs USING btree (code);


--
-- Name: master_tariffs_currency_is_active_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX master_tariffs_currency_is_active_idx ON osi.master_tariffs USING btree (currency, is_active);


--
-- Name: master_tariffs_scope_is_active_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX master_tariffs_scope_is_active_idx ON osi.master_tariffs USING btree (scope, is_active);


--
-- Name: osi_clients_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX osi_clients_code_key ON osi.osi_clients USING btree (code);


--
-- Name: osi_clients_normalizedPhone_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_clients_normalizedPhone_idx" ON osi.osi_clients USING btree ("normalizedPhone") WHERE ("normalizedPhone" IS NOT NULL);


--
-- Name: osi_clients_taxId_unique; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_clients_taxId_unique" ON osi.osi_clients USING btree (upper(regexp_replace("taxId", '[^A-Za-z0-9]'::text, ''::text, 'g'::text))) WHERE (("taxId" IS NOT NULL) AND (btrim("taxId") <> ''::text));


--
-- Name: osi_escalation_events_createdAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_escalation_events_createdAt_idx" ON osi.osi_escalation_events USING btree ("createdAt");


--
-- Name: osi_escalation_events_suggestionId_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_escalation_events_suggestionId_idx" ON osi.osi_escalation_events USING btree ("suggestionId");


--
-- Name: osi_hubs_active_priority_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX osi_hubs_active_priority_idx ON osi.osi_hubs USING btree (active, priority);


--
-- Name: osi_kyc_documents_clientId_type_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_kyc_documents_clientId_type_idx" ON osi.osi_kyc_documents USING btree ("clientId", type);


--
-- Name: osi_kyc_documents_leadId_type_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_kyc_documents_leadId_type_idx" ON osi.osi_kyc_documents USING btree ("leadId", type);


--
-- Name: osi_kyc_documents_status_uploadedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_kyc_documents_status_uploadedAt_idx" ON osi.osi_kyc_documents USING btree (status, "uploadedAt");


--
-- Name: osi_lead_audit_logs_leadId_createdAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_lead_audit_logs_leadId_createdAt_idx" ON osi.osi_lead_audit_logs USING btree ("leadId", "createdAt");


--
-- Name: osi_lead_volume_estimates_areaProfileId_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_lead_volume_estimates_areaProfileId_updatedAt_idx" ON osi.osi_lead_volume_estimates USING btree ("areaProfileId", "updatedAt");


--
-- Name: osi_lead_volume_estimates_confidence_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_lead_volume_estimates_confidence_updatedAt_idx" ON osi.osi_lead_volume_estimates USING btree (confidence, "updatedAt");


--
-- Name: osi_lead_volume_estimates_leadId_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_lead_volume_estimates_leadId_key" ON osi.osi_lead_volume_estimates USING btree ("leadId");


--
-- Name: osi_leads_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX osi_leads_code_key ON osi.osi_leads USING btree (code);


--
-- Name: osi_leads_customerId_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_leads_customerId_idx" ON osi.osi_leads USING btree ("customerId");


--
-- Name: osi_leads_derivedMode_modeUpdatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_leads_derivedMode_modeUpdatedAt_idx" ON osi.osi_leads USING btree ("derivedMode", "modeUpdatedAt");


--
-- Name: osi_leads_leadType_conversionStatus_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_leads_leadType_conversionStatus_idx" ON osi.osi_leads USING btree ("leadType", "conversionStatus");


--
-- Name: osi_leads_projectId_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_leads_projectId_idx" ON osi.osi_leads USING btree ("projectId");


--
-- Name: osi_leads_source_channel_v2_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_leads_source_channel_v2_updatedAt_idx" ON osi.osi_leads USING btree (source_channel_v2, "updatedAt");


--
-- Name: osi_leads_stage_v2_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_leads_stage_v2_updatedAt_idx" ON osi.osi_leads USING btree (stage_v2, "updatedAt");


--
-- Name: osi_leads_status_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_leads_status_updatedAt_idx" ON osi.osi_leads USING btree (status, "updatedAt");


--
-- Name: osi_osi_change_logs_osiId_createdAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_osi_change_logs_osiId_createdAt_idx" ON osi.osi_osi_change_logs USING btree ("osiId", "createdAt");


--
-- Name: osi_osi_handshakes_osiId_status_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_osi_handshakes_osiId_status_idx" ON osi.osi_osi_handshakes USING btree ("osiId", status);


--
-- Name: osi_osi_material_returns_osiId_recordedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_osi_material_returns_osiId_recordedAt_idx" ON osi.osi_osi_material_returns USING btree ("osiId", "recordedAt");


--
-- Name: osi_osi_material_returns_pstCode_recordedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_osi_material_returns_pstCode_recordedAt_idx" ON osi.osi_osi_material_returns USING btree ("pstCode", "recordedAt");


--
-- Name: osi_osis_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX osi_osis_code_key ON osi.osi_osis USING btree (code);


--
-- Name: osi_pipeline_case_quotes_caseId_version_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_pipeline_case_quotes_caseId_version_idx" ON osi.osi_pipeline_case_quotes USING btree ("caseId", version);


--
-- Name: osi_pipeline_case_quotes_status_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_pipeline_case_quotes_status_updatedAt_idx" ON osi.osi_pipeline_case_quotes USING btree (status, "updatedAt");


--
-- Name: osi_pipeline_cases_caseCode_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_pipeline_cases_caseCode_key" ON osi.osi_pipeline_cases USING btree ("caseCode");


--
-- Name: osi_pipeline_cases_createdAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_pipeline_cases_createdAt_idx" ON osi.osi_pipeline_cases USING btree ("createdAt");


--
-- Name: osi_pipeline_cases_mode_status_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_pipeline_cases_mode_status_updatedAt_idx" ON osi.osi_pipeline_cases USING btree (mode, status, "updatedAt");


--
-- Name: osi_pipeline_cases_ownerId_status_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_pipeline_cases_ownerId_status_updatedAt_idx" ON osi.osi_pipeline_cases USING btree ("ownerId", status, "updatedAt");


--
-- Name: osi_pipeline_crating_requests_caseId_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_pipeline_crating_requests_caseId_key" ON osi.osi_pipeline_crating_requests USING btree ("caseId");


--
-- Name: osi_pipeline_crating_requests_status_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_pipeline_crating_requests_status_updatedAt_idx" ON osi.osi_pipeline_crating_requests USING btree (status, "updatedAt");


--
-- Name: osi_pipeline_events_caseId_startAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_pipeline_events_caseId_startAt_idx" ON osi.osi_pipeline_events USING btree ("caseId", "startAt");


--
-- Name: osi_pipeline_events_code_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX osi_pipeline_events_code_idx ON osi.osi_pipeline_events USING btree (code);


--
-- Name: osi_pipeline_events_eventType_startAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_pipeline_events_eventType_startAt_idx" ON osi.osi_pipeline_events USING btree ("eventType", "startAt");


--
-- Name: osi_project_coordination_communications_coordination_id_sent_at; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX osi_project_coordination_communications_coordination_id_sent_at ON osi.osi_project_coordination_communications USING btree (coordination_id, sent_at);


--
-- Name: osi_project_coordination_project_id_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX osi_project_coordination_project_id_key ON osi.osi_project_coordination USING btree (project_id);


--
-- Name: osi_project_pgd_items_projectPgdId_status_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_project_pgd_items_projectPgdId_status_idx" ON osi.osi_project_pgd_items USING btree ("projectPgdId", status);


--
-- Name: osi_project_pgd_projectId_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_project_pgd_projectId_key" ON osi.osi_project_pgd USING btree ("projectId");


--
-- Name: osi_project_signals_projectId_kind_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_project_signals_projectId_kind_idx" ON osi.osi_project_signals USING btree ("projectId", kind);


--
-- Name: osi_project_signals_projectId_kind_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_project_signals_projectId_kind_key" ON osi.osi_project_signals USING btree ("projectId", kind);


--
-- Name: osi_projects_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX osi_projects_code_key ON osi.osi_projects USING btree (code);


--
-- Name: osi_projects_fileNumber_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_projects_fileNumber_key" ON osi.osi_projects USING btree ("fileNumber");


--
-- Name: osi_ptf_adjustment_suggestions_pstCode_status_createdAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_ptf_adjustment_suggestions_pstCode_status_createdAt_idx" ON osi.osi_ptf_adjustment_suggestions USING btree ("pstCode", status, "createdAt");


--
-- Name: osi_survey_item_nesting_surveyItemId_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_survey_item_nesting_surveyItemId_key" ON osi.osi_survey_item_nesting USING btree ("surveyItemId");


--
-- Name: osi_survey_items_roomId_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_survey_items_roomId_idx" ON osi.osi_survey_items USING btree ("roomId");


--
-- Name: osi_survey_items_surveyId_packLevel_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_survey_items_surveyId_packLevel_idx" ON osi.osi_survey_items USING btree ("surveyId", "packLevel");


--
-- Name: osi_survey_media_surveyId_type_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_survey_media_surveyId_type_idx" ON osi.osi_survey_media USING btree ("surveyId", type);


--
-- Name: osi_survey_media_surveyItemId_type_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_survey_media_surveyItemId_type_idx" ON osi.osi_survey_media USING btree ("surveyItemId", type);


--
-- Name: osi_survey_rooms_surveyId_sortOrder_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_survey_rooms_surveyId_sortOrder_idx" ON osi.osi_survey_rooms USING btree ("surveyId", "sortOrder");


--
-- Name: osi_survey_signatures_surveyId_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_survey_signatures_surveyId_key" ON osi.osi_survey_signatures USING btree ("surveyId");


--
-- Name: osi_survey_site_access_surveyId_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_survey_site_access_surveyId_key" ON osi.osi_survey_site_access USING btree ("surveyId");


--
-- Name: osi_survey_site_access_surveyId_longCarry_stairCarryRisk_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_survey_site_access_surveyId_longCarry_stairCarryRisk_idx" ON osi.osi_survey_site_access USING btree ("surveyId", "longCarry", "stairCarryRisk");


--
-- Name: osi_surveys_leadId_createdAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_surveys_leadId_createdAt_idx" ON osi.osi_surveys USING btree ("leadId", "createdAt");


--
-- Name: osi_surveys_status_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_surveys_status_updatedAt_idx" ON osi.osi_surveys USING btree (status, "updatedAt");


--
-- Name: osi_template_versions_status_createdAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_template_versions_status_createdAt_idx" ON osi.osi_template_versions USING btree (status, "createdAt");


--
-- Name: osi_template_versions_templateId_status_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_template_versions_templateId_status_idx" ON osi.osi_template_versions USING btree ("templateId", status);


--
-- Name: osi_template_versions_templateId_version_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_template_versions_templateId_version_key" ON osi.osi_template_versions USING btree ("templateId", version);


--
-- Name: osi_templates_type_name_tenantId_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_templates_type_name_tenantId_key" ON osi.osi_templates USING btree (type, name, "tenantId");


--
-- Name: osi_templates_type_tenantId_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_templates_type_tenantId_idx" ON osi.osi_templates USING btree (type, "tenantId");


--
-- Name: osi_tipos_servicio_config_active_serviceKey_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_tipos_servicio_config_active_serviceKey_idx" ON osi.osi_tipos_servicio_config USING btree (active, "serviceKey");


--
-- Name: osi_tipos_servicio_config_serviceKey_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX "osi_tipos_servicio_config_serviceKey_key" ON osi.osi_tipos_servicio_config USING btree ("serviceKey");


--
-- Name: osi_users_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX osi_users_code_key ON osi.osi_users USING btree (code);


--
-- Name: osi_users_email_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX osi_users_email_key ON osi.osi_users USING btree (email);


--
-- Name: osi_volume_area_profiles_active_updatedAt_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX "osi_volume_area_profiles_active_updatedAt_idx" ON osi.osi_volume_area_profiles USING btree (active, "updatedAt");


--
-- Name: osi_volume_area_profiles_name_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX osi_volume_area_profiles_name_key ON osi.osi_volume_area_profiles USING btree (name);


--
-- Name: quote_addendums_quote_status_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX quote_addendums_quote_status_idx ON osi.quote_addendums USING btree (quote_id, status);


--
-- Name: quote_versions_quote_id_version_number_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX quote_versions_quote_id_version_number_idx ON osi.quote_versions USING btree (quote_id, version_number);


--
-- Name: quotes_case_id_level_version_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX quotes_case_id_level_version_key ON osi.quotes USING btree (case_id, level, version);


--
-- Name: quotes_case_id_status_sent_at_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX quotes_case_id_status_sent_at_idx ON osi.quotes USING btree (case_id, status, sent_at);


--
-- Name: service_cases_case_code_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX service_cases_case_code_idx ON osi.service_cases USING btree (case_code);


--
-- Name: service_cases_case_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX service_cases_case_code_key ON osi.service_cases USING btree (case_code);


--
-- Name: service_cases_created_at_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX service_cases_created_at_idx ON osi.service_cases USING btree (created_at);


--
-- Name: service_cases_mode_status_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX service_cases_mode_status_idx ON osi.service_cases USING btree (mode, status);


--
-- Name: service_cases_owner_contact_id_status_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX service_cases_owner_contact_id_status_idx ON osi.service_cases USING btree (owner_contact_id, status);


--
-- Name: service_cases_service_flags_gin_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX service_cases_service_flags_gin_idx ON osi.service_cases USING gin (service_flags);


--
-- Name: surcharge_catalog_code_key; Type: INDEX; Schema: osi; Owner: -
--

CREATE UNIQUE INDEX surcharge_catalog_code_key ON osi.surcharge_catalog USING btree (code);


--
-- Name: surcharge_catalog_currency_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX surcharge_catalog_currency_idx ON osi.surcharge_catalog USING btree (currency);


--
-- Name: tariff_overrides_profile_id_scope_mode_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX tariff_overrides_profile_id_scope_mode_idx ON osi.tariff_overrides USING btree (profile_id, scope, mode);


--
-- Name: tariff_overrides_route_key_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX tariff_overrides_route_key_idx ON osi.tariff_overrides USING btree (route_key);


--
-- Name: tariff_rate_bands_rate_set_id_from_value_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX tariff_rate_bands_rate_set_id_from_value_idx ON osi.tariff_rate_bands USING btree (rate_set_id, from_value);


--
-- Name: tariff_rate_sets_master_tariff_id_mode_idx; Type: INDEX; Schema: osi; Owner: -
--

CREATE INDEX tariff_rate_sets_master_tariff_id_mode_idx ON osi.tariff_rate_sets USING btree (master_tariff_id, mode);


--
-- Name: CratePlanItem_cratePlanId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CratePlanItem_cratePlanId_idx" ON public."CratePlanItem" USING btree ("cratePlanId");


--
-- Name: CratePlan_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CratePlan_createdById_idx" ON public."CratePlan" USING btree ("createdById");


--
-- Name: CratePlan_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CratePlan_tenantId_idx" ON public."CratePlan" USING btree ("tenantId");


--
-- Name: Invitation_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invitation_email_idx" ON public."Invitation" USING btree (email);


--
-- Name: Invitation_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Invitation_tenantId_idx" ON public."Invitation" USING btree ("tenantId");


--
-- Name: Invitation_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invitation_token_key" ON public."Invitation" USING btree (token);


--
-- Name: Membership_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Membership_tenantId_idx" ON public."Membership" USING btree ("tenantId");


--
-- Name: Membership_tenantId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON public."Membership" USING btree ("tenantId", "userId");


--
-- Name: Membership_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Membership_userId_idx" ON public."Membership" USING btree ("userId");


--
-- Name: Tenant_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Tenant_slug_key" ON public."Tenant" USING btree (slug);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: crating_requests trg_block_import_crating_requests; Type: TRIGGER; Schema: osi; Owner: -
--

CREATE TRIGGER trg_block_import_crating_requests BEFORE INSERT OR UPDATE ON osi.crating_requests FOR EACH ROW EXECUTE FUNCTION osi.block_import_crating_requests();


--
-- Name: account_contacts account_contacts_account_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.account_contacts
    ADD CONSTRAINT account_contacts_account_id_fkey FOREIGN KEY (account_id) REFERENCES osi.accounts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: account_contacts account_contacts_contact_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.account_contacts
    ADD CONSTRAINT account_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES osi.contacts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: account_pricing_profiles account_pricing_profiles_account_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.account_pricing_profiles
    ADD CONSTRAINT account_pricing_profiles_account_id_fkey FOREIGN KEY (account_id) REFERENCES osi.accounts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: account_pricing_profiles account_pricing_profiles_base_master_tariff_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.account_pricing_profiles
    ADD CONSTRAINT account_pricing_profiles_base_master_tariff_id_fkey FOREIGN KEY (base_master_tariff_id) REFERENCES osi.master_tariffs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: account_surcharge_policies account_surcharge_policies_profile_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.account_surcharge_policies
    ADD CONSTRAINT account_surcharge_policies_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES osi.account_pricing_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: account_surcharge_policies account_surcharge_policies_surcharge_code_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.account_surcharge_policies
    ADD CONSTRAINT account_surcharge_policies_surcharge_code_fkey FOREIGN KEY (surcharge_code) REFERENCES osi.surcharge_catalog(code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: business_entity_types business_entity_types_business_entity_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.business_entity_types
    ADD CONSTRAINT business_entity_types_business_entity_id_fkey FOREIGN KEY (business_entity_id) REFERENCES osi.business_entities(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: business_entity_types business_entity_types_entity_type_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.business_entity_types
    ADD CONSTRAINT business_entity_types_entity_type_id_fkey FOREIGN KEY (entity_type_id) REFERENCES osi.entity_types(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: case_milestones case_milestones_case_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.case_milestones
    ADD CONSTRAINT case_milestones_case_id_fkey FOREIGN KEY (case_id) REFERENCES osi.service_cases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: commission_agreements commission_agreements_business_entity_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.commission_agreements
    ADD CONSTRAINT commission_agreements_business_entity_id_fkey FOREIGN KEY (business_entity_id) REFERENCES osi.business_entities(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: crating_requests crating_requests_case_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.crating_requests
    ADD CONSTRAINT crating_requests_case_id_fkey FOREIGN KEY (case_id) REFERENCES osi.service_cases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: crating_requests crating_requests_quote_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.crating_requests
    ADD CONSTRAINT crating_requests_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES osi.quotes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: entity_contacts entity_contacts_business_entity_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.entity_contacts
    ADD CONSTRAINT entity_contacts_business_entity_id_fkey FOREIGN KEY (business_entity_id) REFERENCES osi.business_entities(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: events events_assigned_to_contact_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.events
    ADD CONSTRAINT events_assigned_to_contact_id_fkey FOREIGN KEY (assigned_to_contact_id) REFERENCES osi.contacts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: events events_case_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.events
    ADD CONSTRAINT events_case_id_fkey FOREIGN KEY (case_id) REFERENCES osi.service_cases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: events events_location_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.events
    ADD CONSTRAINT events_location_id_fkey FOREIGN KEY (location_id) REFERENCES osi.locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: global_commercial_settings global_commercial_settings_hub_principal_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.global_commercial_settings
    ADD CONSTRAINT global_commercial_settings_hub_principal_id_fkey FOREIGN KEY (hub_principal_id) REFERENCES osi.osi_hubs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lead_addresses lead_addresses_lead_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_addresses
    ADD CONSTRAINT lead_addresses_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES osi.osi_leads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lead_commissions lead_commissions_commission_agreement_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_commissions
    ADD CONSTRAINT lead_commissions_commission_agreement_id_fkey FOREIGN KEY (commission_agreement_id) REFERENCES osi.commission_agreements(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lead_commissions lead_commissions_lead_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_commissions
    ADD CONSTRAINT lead_commissions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES osi.osi_leads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lead_commissions lead_commissions_referral_entity_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_commissions
    ADD CONSTRAINT lead_commissions_referral_entity_id_fkey FOREIGN KEY (referral_entity_id) REFERENCES osi.business_entities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lead_parties lead_parties_business_entity_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_parties
    ADD CONSTRAINT lead_parties_business_entity_id_fkey FOREIGN KEY (business_entity_id) REFERENCES osi.business_entities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lead_parties lead_parties_contact_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_parties
    ADD CONSTRAINT lead_parties_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES osi.entity_contacts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lead_parties lead_parties_lead_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_parties
    ADD CONSTRAINT lead_parties_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES osi.osi_leads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lead_service_requirements lead_service_requirements_lead_service_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_service_requirements
    ADD CONSTRAINT lead_service_requirements_lead_service_id_fkey FOREIGN KEY (lead_service_id) REFERENCES osi.lead_services(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lead_services lead_services_lead_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_services
    ADD CONSTRAINT lead_services_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES osi.osi_leads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lead_stage_history lead_stage_history_lead_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.lead_stage_history
    ADD CONSTRAINT lead_stage_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES osi.osi_leads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: location_access_profiles location_access_profiles_location_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.location_access_profiles
    ADD CONSTRAINT location_access_profiles_location_id_fkey FOREIGN KEY (location_id) REFERENCES osi.locations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_escalation_events osi_escalation_events_suggestionId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_escalation_events
    ADD CONSTRAINT "osi_escalation_events_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES osi.osi_ptf_adjustment_suggestions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_kyc_documents osi_kyc_documents_clientId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_kyc_documents
    ADD CONSTRAINT "osi_kyc_documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES osi.osi_clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_kyc_documents osi_kyc_documents_leadId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_kyc_documents
    ADD CONSTRAINT "osi_kyc_documents_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES osi.osi_leads(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_lead_audit_logs osi_lead_audit_logs_actorId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_lead_audit_logs
    ADD CONSTRAINT "osi_lead_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_lead_audit_logs osi_lead_audit_logs_leadId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_lead_audit_logs
    ADD CONSTRAINT "osi_lead_audit_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES osi.osi_leads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_lead_volume_estimates osi_lead_volume_estimates_areaProfileId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_lead_volume_estimates
    ADD CONSTRAINT "osi_lead_volume_estimates_areaProfileId_fkey" FOREIGN KEY ("areaProfileId") REFERENCES osi.osi_volume_area_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: osi_lead_volume_estimates osi_lead_volume_estimates_leadId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_lead_volume_estimates
    ADD CONSTRAINT "osi_lead_volume_estimates_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES osi.osi_leads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_lead_volume_estimates osi_lead_volume_estimates_updatedById_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_lead_volume_estimates
    ADD CONSTRAINT "osi_lead_volume_estimates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_leads osi_leads_customerId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_leads
    ADD CONSTRAINT "osi_leads_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES osi.osi_clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_leads osi_leads_projectId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_leads
    ADD CONSTRAINT "osi_leads_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES osi.osi_projects(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_osi_change_logs osi_osi_change_logs_osiId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_osi_change_logs
    ADD CONSTRAINT "osi_osi_change_logs_osiId_fkey" FOREIGN KEY ("osiId") REFERENCES osi.osi_osis(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_osi_handshakes osi_osi_handshakes_osiId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_osi_handshakes
    ADD CONSTRAINT "osi_osi_handshakes_osiId_fkey" FOREIGN KEY ("osiId") REFERENCES osi.osi_osis(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_osi_material_returns osi_osi_material_returns_osiId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_osi_material_returns
    ADD CONSTRAINT "osi_osi_material_returns_osiId_fkey" FOREIGN KEY ("osiId") REFERENCES osi.osi_osis(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_osis osi_osis_projectId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_osis
    ADD CONSTRAINT "osi_osis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES osi.osi_projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_pipeline_case_quotes osi_pipeline_case_quotes_caseId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_pipeline_case_quotes
    ADD CONSTRAINT "osi_pipeline_case_quotes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES osi.osi_pipeline_cases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_pipeline_cases osi_pipeline_cases_ownerId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_pipeline_cases
    ADD CONSTRAINT "osi_pipeline_cases_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_pipeline_crating_requests osi_pipeline_crating_requests_caseId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_pipeline_crating_requests
    ADD CONSTRAINT "osi_pipeline_crating_requests_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES osi.osi_pipeline_cases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_pipeline_events osi_pipeline_events_caseId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_pipeline_events
    ADD CONSTRAINT "osi_pipeline_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES osi.osi_pipeline_cases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_project_coordination_communications osi_project_coordination_communications_coordination_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_coordination_communications
    ADD CONSTRAINT osi_project_coordination_communications_coordination_id_fkey FOREIGN KEY (coordination_id) REFERENCES osi.osi_project_coordination(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_project_coordination osi_project_coordination_project_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_coordination
    ADD CONSTRAINT osi_project_coordination_project_id_fkey FOREIGN KEY (project_id) REFERENCES osi.osi_projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_project_pgd osi_project_pgd_appliedById_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_pgd
    ADD CONSTRAINT "osi_project_pgd_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_project_pgd_items osi_project_pgd_items_projectPgdId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_pgd_items
    ADD CONSTRAINT "osi_project_pgd_items_projectPgdId_fkey" FOREIGN KEY ("projectPgdId") REFERENCES osi.osi_project_pgd(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_project_pgd_items osi_project_pgd_items_validatedById_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_pgd_items
    ADD CONSTRAINT "osi_project_pgd_items_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_project_pgd osi_project_pgd_projectId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_pgd
    ADD CONSTRAINT "osi_project_pgd_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES osi.osi_projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_project_pgd osi_project_pgd_templateId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_pgd
    ADD CONSTRAINT "osi_project_pgd_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES osi.osi_templates(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: osi_project_pgd osi_project_pgd_templateVersionId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_pgd
    ADD CONSTRAINT "osi_project_pgd_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES osi.osi_template_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: osi_project_signals osi_project_signals_ackById_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_signals
    ADD CONSTRAINT "osi_project_signals_ackById_fkey" FOREIGN KEY ("ackById") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_project_signals osi_project_signals_projectId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_project_signals
    ADD CONSTRAINT "osi_project_signals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES osi.osi_projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_projects osi_projects_clientId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_projects
    ADD CONSTRAINT "osi_projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES osi.osi_clients(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_survey_item_nesting osi_survey_item_nesting_surveyItemId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_item_nesting
    ADD CONSTRAINT "osi_survey_item_nesting_surveyItemId_fkey" FOREIGN KEY ("surveyItemId") REFERENCES osi.osi_survey_items(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_survey_items osi_survey_items_roomId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_items
    ADD CONSTRAINT "osi_survey_items_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES osi.osi_survey_rooms(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_survey_items osi_survey_items_surveyId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_items
    ADD CONSTRAINT "osi_survey_items_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES osi.osi_surveys(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_survey_media osi_survey_media_surveyId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_media
    ADD CONSTRAINT "osi_survey_media_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES osi.osi_surveys(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_survey_media osi_survey_media_surveyItemId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_media
    ADD CONSTRAINT "osi_survey_media_surveyItemId_fkey" FOREIGN KEY ("surveyItemId") REFERENCES osi.osi_survey_items(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_survey_rooms osi_survey_rooms_surveyId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_rooms
    ADD CONSTRAINT "osi_survey_rooms_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES osi.osi_surveys(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_survey_signatures osi_survey_signatures_surveyId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_signatures
    ADD CONSTRAINT "osi_survey_signatures_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES osi.osi_surveys(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_survey_site_access osi_survey_site_access_surveyId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_survey_site_access
    ADD CONSTRAINT "osi_survey_site_access_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES osi.osi_surveys(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_surveys osi_surveys_clientId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_surveys
    ADD CONSTRAINT "osi_surveys_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES osi.osi_clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_surveys osi_surveys_leadId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_surveys
    ADD CONSTRAINT "osi_surveys_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES osi.osi_leads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_surveys osi_surveys_projectId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_surveys
    ADD CONSTRAINT "osi_surveys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES osi.osi_projects(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_template_versions osi_template_versions_approvedById_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_template_versions
    ADD CONSTRAINT "osi_template_versions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_template_versions osi_template_versions_baseVersionId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_template_versions
    ADD CONSTRAINT "osi_template_versions_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES osi.osi_template_versions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_template_versions osi_template_versions_createdById_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_template_versions
    ADD CONSTRAINT "osi_template_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: osi_template_versions osi_template_versions_rejectedById_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_template_versions
    ADD CONSTRAINT "osi_template_versions_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_template_versions osi_template_versions_templateId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_template_versions
    ADD CONSTRAINT "osi_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES osi.osi_templates(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: osi_templates osi_templates_publishedVersionId_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_templates
    ADD CONSTRAINT "osi_templates_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES osi.osi_template_versions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_tipos_servicio_config osi_tipos_servicio_config_updatedById_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_tipos_servicio_config
    ADD CONSTRAINT "osi_tipos_servicio_config_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: osi_volume_area_profiles osi_volume_area_profiles_updatedById_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.osi_volume_area_profiles
    ADD CONSTRAINT "osi_volume_area_profiles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES osi.osi_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: quote_line_items quote_line_items_quote_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.quote_line_items
    ADD CONSTRAINT quote_line_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES osi.quotes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quote_versions quote_versions_quote_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.quote_versions
    ADD CONSTRAINT quote_versions_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES osi.quotes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quotes quotes_case_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.quotes
    ADD CONSTRAINT quotes_case_id_fkey FOREIGN KEY (case_id) REFERENCES osi.service_cases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: service_cases service_cases_account_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.service_cases
    ADD CONSTRAINT service_cases_account_id_fkey FOREIGN KEY (account_id) REFERENCES osi.accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_cases service_cases_approver_contact_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.service_cases
    ADD CONSTRAINT service_cases_approver_contact_id_fkey FOREIGN KEY (approver_contact_id) REFERENCES osi.contacts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_cases service_cases_destination_location_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.service_cases
    ADD CONSTRAINT service_cases_destination_location_id_fkey FOREIGN KEY (destination_location_id) REFERENCES osi.locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_cases service_cases_origin_location_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.service_cases
    ADD CONSTRAINT service_cases_origin_location_id_fkey FOREIGN KEY (origin_location_id) REFERENCES osi.locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_cases service_cases_owner_contact_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.service_cases
    ADD CONSTRAINT service_cases_owner_contact_id_fkey FOREIGN KEY (owner_contact_id) REFERENCES osi.contacts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_cases service_cases_payer_contact_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.service_cases
    ADD CONSTRAINT service_cases_payer_contact_id_fkey FOREIGN KEY (payer_contact_id) REFERENCES osi.contacts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: service_cases service_cases_primary_contact_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.service_cases
    ADD CONSTRAINT service_cases_primary_contact_id_fkey FOREIGN KEY (primary_contact_id) REFERENCES osi.contacts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: surveys surveys_case_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.surveys
    ADD CONSTRAINT surveys_case_id_fkey FOREIGN KEY (case_id) REFERENCES osi.service_cases(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: surveys surveys_performed_by_contact_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.surveys
    ADD CONSTRAINT surveys_performed_by_contact_id_fkey FOREIGN KEY (performed_by_contact_id) REFERENCES osi.contacts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tariff_overrides tariff_overrides_profile_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.tariff_overrides
    ADD CONSTRAINT tariff_overrides_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES osi.account_pricing_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tariff_rate_bands tariff_rate_bands_rate_set_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.tariff_rate_bands
    ADD CONSTRAINT tariff_rate_bands_rate_set_id_fkey FOREIGN KEY (rate_set_id) REFERENCES osi.tariff_rate_sets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tariff_rate_sets tariff_rate_sets_master_tariff_id_fkey; Type: FK CONSTRAINT; Schema: osi; Owner: -
--

ALTER TABLE ONLY osi.tariff_rate_sets
    ADD CONSTRAINT tariff_rate_sets_master_tariff_id_fkey FOREIGN KEY (master_tariff_id) REFERENCES osi.master_tariffs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CratePlanItem CratePlanItem_cratePlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CratePlanItem"
    ADD CONSTRAINT "CratePlanItem_cratePlanId_fkey" FOREIGN KEY ("cratePlanId") REFERENCES public."CratePlan"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Invitation Invitation_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Invitation Invitation_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invitation"
    ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Membership Membership_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Membership Membership_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Membership"
    ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Project Project_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--
