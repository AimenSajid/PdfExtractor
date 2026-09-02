import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "./AuthContext";
import { GOOGLE_CLIENT_ID } from "./apiConfig";

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-lg shadow p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">PDF Extractor</h1>
        <p className="text-gray-500 text-sm mb-8">
          Upload a paper and pull out its title, authors, abstract and more.
        </p>

        {GOOGLE_CLIENT_ID ? (
          <div className="flex justify-center mb-6">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError("Google sign-in was cancelled or failed.")}
              useOneTap={false}
            />
          </div>
        ) : (
          <p className="text-sm text-red-600 mb-6">
            VITE_GOOGLE_CLIENT_ID is not set. Add it to{" "}
            <code className="bg-gray-100 px-1 rounded">frontend/.env</code> and
            restart the dev server to enable Google sign-in.
          </p>
        )}

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <div className="border-t pt-6">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-600 underline hover:text-gray-900"
          >
            Back to extractor
          </button>
        </div>
      </div>
    </div>
  );
}
