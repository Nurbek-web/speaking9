import { SignUp } from '@clerk/nextjs';

export default function Page() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <SignUp 
          path="/sign-up" 
          routing="path" 
          signInUrl="/sign-in"
          fallbackRedirectUrl="/tests"
          appearance={{
            elements: {
              rootBox: "mx-auto w-full",
              card: "shadow-md rounded-lg"
            }
          }}
        />
      </div>
    </div>
  );
} 