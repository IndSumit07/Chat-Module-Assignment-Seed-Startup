import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { respondToInvitation } from '../api/invitation.js';
import { Loader2, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RespondInvitationPage() {
  const { id, action } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing'); // processing, success, error
  const [errorMessage, setErrorMessage] = useState('');
  const hasProcessed = useRef(false);

  useEffect(() => {
    const processInvitation = async () => {
      if (hasProcessed.current) return;
      hasProcessed.current = true;

      try {
        await respondToInvitation(id, action);
        setStatus('success');
        toast.success(action === 'accept' ? 'Successfully joined conversation!' : 'Invitation rejected.');
        
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 2000);
      } catch (err) {
        setStatus('error');
        setErrorMessage(err.response?.data?.message || 'Failed to process invitation.');
      }
    };

    processInvitation();
  }, [id, action, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center mx-auto mb-6">
          <MessageSquare className="w-6 h-6 text-white" />
        </div>

        {status === 'processing' && (
          <>
            <Loader2 className="w-8 h-8 text-black animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-black mb-2">Processing Invitation</h2>
            <p className="text-sm text-gray-500">Please wait while we update your membership...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-black mb-2">Success!</h2>
            <p className="text-sm text-gray-500 mb-6">
              You've successfully {action === 'accept' ? 'joined the conversation' : 'rejected the invitation'}.
            </p>
            <p className="text-xs text-gray-400">Redirecting you to the dashboard...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-black mb-2">Oops! Something went wrong</h2>
            <p className="text-sm text-red-600 mb-6">{errorMessage}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn-primary w-full"
            >
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
