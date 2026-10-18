# Nova AI

A personal AI chat application built with **React**, **FastAPI**, **Groq**, and **PostgreSQL**. Nova AI supports streamed AI responses, user authentication, saved conversations, and persistent user memories.

## Features

- AI chat powered by the Groq API
- Streaming responses using Server-Sent Events (SSE)
- User authentication with password hashing and cookie-based sessions
- Conversation history saved to PostgreSQL
- Persistent memory to save and recall user-specific details
- User-specific access controls for conversations and memories
- React + Vite frontend and FastAPI backend

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | Python, FastAPI, Uvicorn |
| AI | Groq API (`openai/gpt-oss-20b`) |
| Database | PostgreSQL (Neon-compatible) |
| ORM | SQLAlchemy |
| Validation | Pydantic |
| Authentication | JWT, cookie-based sessions, Argon2 password hashing |

## Project Structure

```text
chat1/
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── database.py
│   ├── auth.py
│   ├── requirements.txt
│   └── .env                 # Local secrets; do not commit
├── frontend/
│   ├── src/
│   ├── package.json
│   └── .env                 # Local frontend variables, if used
└── .gitignore
```

Your exact structure may differ; adjust paths and commands as needed.

## Prerequisites

- Python version supported by your backend dependencies (Python 3.11 is a reasonable starting point)
- Node.js and npm
- A Groq API key
- A PostgreSQL database, such as Neon
- Git

## Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
```

Replace the placeholder URL with your repository URL.

### 2. Configure and run the backend

From the project root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment.

**Windows PowerShell**
```powershell
.\.venv\Scripts\Activate.ps1
```

**Windows Command Prompt**
```bat
.venv\Scripts\activate.bat
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create `backend/.env` and add the environment variables your code expects. Based on the current project setup, they are expected to look like:

```dotenv
GROQ_API_KEY=your_groq_api_key
DATABASE_URL=your_postgresql_connection_string
AUTH_SECRET_KEY=replace_with_a_long_random_secret
COOKIE_SECURE=false
```

Keep real credentials private. `COOKIE_SECURE=false` is for local HTTP development only; use secure cookies in production. Verify the exact variable names in your code before running.

Start the backend from the `backend` directory:

```bash
uvicorn main:app --reload
```

The API should be available at `http://localhost:8000`. Check `http://localhost:8000/health` to confirm the backend is running and whether the Groq key is configured. This health check does not prove the key has quota or that model requests will succeed.

### 3. Configure and run the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite normally serves the app at `http://localhost:5173`.

Configure the frontend API base URL to point to the local backend (`http://localhost:8000`) using the variable or configuration your frontend actually reads. Check `src/App.jsx` before assuming a variable name.

## Environment Variables

Never commit `.env` files, API keys, database passwords, session secrets, or access tokens.

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Authenticates backend requests to Groq |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET_KEY` | Signs authentication tokens/sessions |
| `COOKIE_SECURE` | Controls secure-cookie behavior; use `true` in HTTPS production |

Confirm the exact names in your source code. Use hosting dashboard environment settings for production secrets rather than uploading `.env` files.

## Free-Tier Deployment Option

A possible deployment setup is:

- **Frontend:** Vercel
- **Backend:** Render
- **Database:** Your existing Neon PostgreSQL database

Free-tier availability and limits can change. Render free web services may sleep after inactivity, making the first request slower.

### Deploy the backend to Render

1. Push the project to GitHub.
2. In Render, create a new **Web Service** and connect the repository.
3. Set the root directory to `backend` if that field is available.
4. Use this build command if your dependency file is named `requirements.txt`:

   ```bash
   pip install -r requirements.txt
   ```

5. Use this start command:

   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

6. Add required environment variables in Render's dashboard. Do not upload your local `.env`.
7. Deploy and test the health endpoint.

### Deploy the frontend to Vercel

1. Import the GitHub repository into Vercel.
2. Set the project root directory to `frontend`.
3. Use `npm run build` and output directory `dist` if Vercel does not detect the Vite settings automatically.
4. Configure the frontend API URL to point to your deployed Render backend, using the configuration your frontend actually reads.
5. Deploy the site.

### Production checks

- Configure FastAPI CORS to allow the exact deployed frontend origin.
- Ensure auth cookies work between the deployed frontend and backend. Cross-site cookies generally require `Secure` and `SameSite=None` over HTTPS; verify the cookie settings in `auth.py`.
- Set production secrets in hosting dashboards.
- Confirm database connectivity and required SSL settings.
- Test registration, login, logout, chat streaming, conversation history, and memory operations.
- Verify that users cannot access another user's conversations or memories.
- Never expose the Groq API key in frontend code or Vite environment variables.

## Troubleshooting

**Backend will not start**
- Activate the virtual environment.
- Install dependencies from `requirements.txt`.
- Read the first Python traceback in the terminal.

**Frontend cannot reach the backend**
- Check the API URL configured in the frontend.
- Check FastAPI CORS settings.
- Inspect the browser Network panel for failed requests.

**Chat returns a blank response**
- Check the backend terminal for `Chat generation error`.
- Verify the Groq model name and API key.
- Check Groq account limits and API errors.
- Confirm the frontend parses SSE `chunk`, `done`, and `error` events correctly.

**Database connection fails**
- Check `DATABASE_URL`, database availability, and provider SSL requirements.

## Status

Nova AI is under active development. Features and deployment instructions may evolve.

## License

No license has been specified yet. Add a `LICENSE` file before presenting the project as open source.
