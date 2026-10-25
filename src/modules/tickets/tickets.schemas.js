const { z } = require('zod');

const positiveId = z.coerce.number().int().positive();

const ticketParamsSchema = z.object({ id: positiveId });
const serviceParamsSchema = z.object({ serviceId: positiveId });

module.exports = {
  ticketParamsSchema,
  serviceParamsSchema,
};
