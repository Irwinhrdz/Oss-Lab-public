import Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NETBOX_URL: Joi.string().uri().required(),
  NETBOX_API_TOKEN: Joi.string().required(),
  OPEN5GS_MONGO_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
  TEMPLATE_IMSI: Joi.string()
    .pattern(/^\d{15}$/)
    .required(),
  IMSI_PREFIX: Joi.string()
    .pattern(/^\d{1,10}$/)
    .default('99970'),
  OPEN5GS_AMF_METRICS_URL: Joi.string().uri().default('http://127.0.0.5:9090'),
  OPEN5GS_SMF_METRICS_URL: Joi.string().uri().default('http://127.0.0.4:9090'),
  OPEN5GS_UPF_METRICS_URL: Joi.string().uri().default('http://127.0.0.7:9090'),
  // Opcionales: si faltan, /topology sigue funcionando pero sin alarmas (ver ZabbixService).
  ZABBIX_URL: Joi.string().uri().optional(),
  ZABBIX_API_TOKEN: Joi.string().optional(),
});
