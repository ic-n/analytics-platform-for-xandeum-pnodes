# Xandeum pNode Analytics Dashboard

> Real-time monitoring for the Xandeum pNode network

## Overview

This dashboard provides live analytics for Xandeum's decentralized storage network. It connects directly to pNodes via pRPC (pNode RPC) calls and displays network health, performance metrics, and storage capacity.

## Features

| Feature           | Description                                  |
| ----------------- | -------------------------------------------- |
| Real-time Metrics | CPU, memory, storage, uptime for each pNode  |
| Network Health    | Online/offline/degraded status monitoring    |
| Auto-refresh      | Data updates every 30 seconds                |
| Search            | Filter by IP address or public key           |
| Status Filter     | Show only online, offline, or degraded nodes |
| Copy to Clipboard | One-click IP address copying                 |
| Responsive        | Works on desktop, tablet, and mobile         |

## Technology

- **Frontend**: AstroJS, React, TypeScript, Tailwind CSS
- **API**: Xandeum pRPC (JSON-RPC 2.0)

## pRPC API Endpoints

The dashboard uses two pRPC methods:

### `getStats`

Returns node performance metrics:

```json
{
    "cpu_percent": 23.5,
    "memory_percent": 45.2,
    "storage_used": 128000000000,
    "storage_percent": 42.0,
    "uptime": 2592000
}
```

### `getPods`

Returns gossip network information:

```json
{
    "total_count": 14,
    "pods": [
        {
            "pubkey": "",
            "ip": "",
            "gossip_port": 8001
        }
    ]
}
```

## Configuration

Edit the `KNOWN_PNODE_IPS` array to add or remove pNode addresses:

```javascript
const KNOWN_PNODE_IPS = [
    // Add more IPs...
];
```
