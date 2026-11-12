export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  netbox: {
    url: process.env.NETBOX_URL,
    apiToken: process.env.NETBOX_API_TOKEN,
  },
  zabbix: {
    url: process.env.ZABBIX_URL,
    apiToken: process.env.ZABBIX_API_TOKEN,
  },
  open5gs: {
    mongoUri: process.env.OPEN5GS_MONGO_URI,
    templateImsi: process.env.TEMPLATE_IMSI,
    imsiPrefix: process.env.IMSI_PREFIX ?? '99970',
    nfMetricsUrls: {
      amf: process.env.OPEN5GS_AMF_METRICS_URL ?? 'http://127.0.0.5:9090',
      smf: process.env.OPEN5GS_SMF_METRICS_URL ?? 'http://127.0.0.4:9090',
      upf: process.env.OPEN5GS_UPF_METRICS_URL ?? 'http://127.0.0.7:9090',
    },
  },
});
