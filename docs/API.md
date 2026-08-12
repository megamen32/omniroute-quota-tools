# API behavior

The client requests provider and quota data from the OmniRoute instance:

- `GET /api/providers/client`
- `GET /api/usage/provider-limits`
- `GET /api/usage/quota`
- `POST /api/usage/provider-limits` for an explicit refresh

The displayed result is limited to data returned by those endpoints. A missing provider quota window remains missing; the tool does not estimate it.
