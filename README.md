# Paypal



| Part     | Stack             | Hosted on | Folder      |
| -------- | ----------------- | --------- | ----------- |
| Frontend | React + Vite      | Vercel    | `frontend/` |
| Backend  | FastAPI (Python)  | Render    | `backend/`  |

```
.
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + CORS
│   │   ├── core/config.py     # env-based settings
│   │   └── api/
│   │       ├── router.py      # register new routers here
│   │       └── routes/        # one file per feature
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── lib/api.js         # fetch wrapper using VITE_API_URL
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── vercel.json            # SPA rewrites
└── render.yaml                # Render blueprint for the backend
```


