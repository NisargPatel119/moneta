'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

export default function LinkBank() {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the link token from our backend when the component mounts
  useEffect(() => {
    const createToken = async () => {
      try {
        const response = await fetch('/api/plaid/create-link-token', { method: 'POST' });
        const data = await response.json();
        setToken(data.link_token);
      } catch (e) {
        console.error("Failed to generate link token", e);
      } finally {
        setIsLoading(false);
      }
    };
    createToken();
  }, []);

  const onSuccess = useCallback(async (public_token: any, metadata: any) => {
    // Send the public_token to our backend to exchange and save it to the database
    const response = await fetch('/api/plaid/exchange-public-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token }),
    });
    
    if (response.ok) {
      alert('Bank account linked securely!');
      // TODO: Tell the dashboard to refresh and load transactions
    } else {
      alert('Failed to link account.');
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
  });

  if (isLoading) {
    return <button disabled className="bg-gray-300 text-gray-500 px-6 py-2 rounded-lg font-medium">Loading...</button>;
  }

  return (
    <button
      onClick={() => open()}
      disabled={!ready || !token}
      className="bg-black text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors"
    >
      Link Bank Account
    </button>
  );
}
