import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { FileText } from "lucide-react";
import { useAuth } from "./AuthContext";
import { GOOGLE_CLIENT_ID } from "./apiConfig";
import { Card, BackLink } from "./ui";

export default function LoginPage({ onBack }) {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState(null);

  async function handleSuccess(credentialResponse) {
    setError(null);
    try {
      await loginWithGoogle(credentialResponse.credential);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="flex w-full max-w-[440px] flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-text">
            <FileText size={18} />
          </div>
          <span className="font-display text-xl font-extrabold tracking-tight text-strong">
            PDF Extractor
          </span>
        </div>

        <Card className="p-8">
          <h1 className="mb-2 font-display text-2xl font-bold leading-tight tracking-tight text-strong">
            Sign in to keep
            <br />
            your papers
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-muted">
            Signed-in documents are saved to your account, and the original PDF
            stays available to reopen.
          </p>

          {GOOGLE_CLIENT_ID ? (
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={() => setError("Google sign-in was cancelled or failed.")}
                useOneTap={false}
                theme="outline"
                size="large"
                shape="pill"
                text="signin_with"
                width="360"
              />
            </div>
          ) : (
            <p className="text-sm text-status-red">
              VITE_GOOGLE_CLIENT_ID is not set. Add it to{" "}
              <code className="rounded bg-sunken px-1">frontend/.env</code> and
              restart the dev server to enable Google sign-in.
            </p>
          )}

          {error && <p className="mt-4 text-sm text-status-red">{error}</p>}

          <div className="mt-6 flex justify-center border-t border-line-subtle pt-6">
            <BackLink label="Back to extractor" onClick={onBack} />
          </div>
        </Card>

        <p className="text-center text-xs text-subtle">
          You can keep using the extractor as a guest — documents stay in this
          browser.
        </p>
      </div>
    </div>
  );
}
