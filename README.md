# OMC-R Demo Connector

Standalone Next.js simulator for an MTN Nigeria-style OMC-R network operations feed.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3001/connectors/omcr`.

## Available Routes

- `/connectors/omcr` - live simulated tower, KPI, alarm, and ingestion dashboard
- `/api/omcr/snapshot` - full simulator snapshot
- `/api/omcr/alarms` - list or inject alarms
- `/api/omcr/simulator` - read or toggle simulator state
