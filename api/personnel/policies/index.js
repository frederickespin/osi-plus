import { prisma } from "../../_lib/db.js";
import {
  getPersonnelPoliciesWorkspace,
  mutatePersonnelPolicies,
} from "../../_lib/personnelPoliciesDomain.js";
import { createPersonnelPoliciesHandler } from "../../_lib/personnelPoliciesHttp.js";

export default createPersonnelPoliciesHandler({
  prismaClient: prisma,
  execute: ({ context, input, prisma: database, method, req }) =>
    method === "GET"
      ? getPersonnelPoliciesWorkspace(
          context,
          {
            section: req.query?.section,
            date: req.query?.date,
            profileRef: req.query?.profileRef,
            caseRef: req.query?.caseRef,
          },
          database,
        )
      : mutatePersonnelPolicies(context, input, database),
});
