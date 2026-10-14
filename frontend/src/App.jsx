import { useState } from "react"; // Imports React state for managing the form.
import { ShieldCheck, Eye, EyeOff, Users, LockKeyhole, UserPlus } from "lucide-react"; // Imports icons used in the interface.
import Dashboard from "./Dashboard";
// Sets the Django API base URL and removes a trailing slash if present.
// Use the HRMS Django backend port exposed by Docker.
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8002/api"
).replace(/\/$/, "");

export default function App() {
  const [username, setUsername] = useState(""); // Stores the username.
  const [password, setPassword] = useState(""); // Stores the password.
  const [confirmPassword, setConfirmPassword] = useState(""); // Stores the confirmation password.
  const [email, setEmail] = useState(""); // Stores the email address.
  const [firstName, setFirstName] = useState(""); // Stores the first name.
  const [lastName, setLastName] = useState(""); // Stores the last name.
  const [isRegistering, setIsRegistering] = useState(false); // Chooses between login and registration.
  const [showPassword, setShowPassword] = useState(false); // Controls password visibility.
  const [showConfirmPassword, setShowConfirmPassword] = useState(false); // Controls confirmation visibility.
  const [loading, setLoading] = useState(false); // Tracks an ongoing API request.
  const [error, setError] = useState(""); // Stores an error message for the user.
  const [success, setSuccess] = useState(""); // Stores a success message for the user.
  const [user, setUser] = useState(null); // Stores the logged-in user's profile.

  // Converts Django validation errors into readable text.
  function getErrorMessage(data, fallback) {
    if (data.detail) return data.detail; // Uses Django's general error message when available.

    return Object.entries(data) // Reads each field's validation errors.
      .map(([field, value]) => {
        const messages = Array.isArray(value) ? value.join(" ") : String(value); // Joins multiple messages.
        return `${field}: ${messages}`; // Identifies the field causing the error.
      })
      .join(" ") || fallback; // Returns a fallback if no useful message exists.
  }

  // Handles the login form submission.
  async function handleLogin(event) {
    event.preventDefault(); // Stops the browser from refreshing the page.
    setError(""); // Clears previous errors.
    setSuccess(""); // Clears previous success messages.

    if (!username.trim() || !password) { // Checks required login fields.
      setError("Enter both your username and password."); // Displays a validation message.
      return; // Stops the request if fields are missing.
    }

    setLoading(true); // Shows that login is processing.

    try {
      const loginResponse = await fetch(`${API_BASE}/accounts/login/`, { // Sends credentials to Django.
        method: "POST", // Uses POST to submit credentials.
        headers: { "Content-Type": "application/json" }, // Declares JSON request data.
        body: JSON.stringify({ username: username.trim(), password }), // Sends username and password.
      });

      const loginData = await loginResponse.json().catch(() => ({})); // Reads the response safely.

      if (!loginResponse.ok) { // Checks whether login failed.
        throw new Error(getErrorMessage(loginData, "Login failed. Check your credentials.")); // Reports the failure.
      }

      const accessToken = loginData.access; // Gets the JWT access token.
      const refreshToken = loginData.refresh; // Gets the JWT refresh token.

      if (!accessToken) { // Ensures Django returned a token.
        throw new Error("Login response did not contain an access token."); // Reports an invalid response.
      }

      const profileResponse = await fetch(`${API_BASE}/accounts/me/`, { // Requests the user's profile.
        headers: { Authorization: `Bearer ${accessToken}` }, // Authenticates with the access token.
      });

      const profileData = await profileResponse.json().catch(() => ({})); // Reads the profile response.

      if (!profileResponse.ok) { // Checks whether the profile request failed.
        throw new Error(getErrorMessage(profileData, "Could not load your user profile.")); // Reports the failure.
      }

      sessionStorage.setItem("hrms_access_token", accessToken); // Stores the token for this browser session.

      if (refreshToken) { // Checks whether a refresh token exists.
        sessionStorage.setItem("hrms_refresh_token", refreshToken); // Stores the refresh token.
      }

      setUser(profileData); // Displays the authenticated page.
      setPassword(""); // Clears the password from React state.
    } catch (err) {
      sessionStorage.removeItem("hrms_access_token"); // Removes a potentially stale access token.
      sessionStorage.removeItem("hrms_refresh_token"); // Removes a potentially stale refresh token.
      setError(err.message || "Unable to connect to the HRMS server."); // Displays the error.
    } finally {
      setLoading(false); // Stops the loading indicator.
    }
  }

  // Handles the registration form submission.
  async function handleRegister(event) {
    event.preventDefault(); // Prevents a browser page refresh.
    setError(""); // Clears previous errors.
    setSuccess(""); // Clears previous success messages.

    if (!username.trim() || !email.trim() || !password) { // Checks required registration fields.
      setError("Enter a username, email address and password."); // Requests the missing fields.
      return; // Stops registration.
    }

    if (password.length < 8) { // Checks the minimum password length.
      setError("Password must contain at least 8 characters."); // Displays a password requirement.
      return; // Stops registration.
    }

    if (password !== confirmPassword) { // Checks both passwords match.
      setError("Passwords do not match."); // Tells the user to correct the confirmation.
      return; // Stops registration.
    }

    setLoading(true); // Shows that registration is processing.

    try {
      const response = await fetch(`${API_BASE}/accounts/register/`, { // Calls the Django registration endpoint.
        method: "POST", // Sends registration data using POST.
        headers: { "Content-Type": "application/json" }, // Declares JSON request data.
        body: JSON.stringify({ // Converts the registration fields into JSON.
          username: username.trim(), // Sends the username.
          email: email.trim(), // Sends the email address.
          first_name: firstName.trim(), // Sends the first name.
          last_name: lastName.trim(), // Sends the last name.
          password, // Sends the password over the API connection.
        }),
      });

      const data = await response.json().catch(() => ({})); // Reads the registration response.

      if (!response.ok) { // Checks whether registration failed.
        throw new Error(getErrorMessage(data, "Registration failed. Please try again.")); // Reports validation errors.
      }

      setSuccess("Account created successfully! You can now sign in."); // Confirms successful registration.
      setIsRegistering(false); // Returns to the login form.
      setPassword(""); // Clears the password field.
      setConfirmPassword(""); // Clears the confirmation field.
      setFirstName(""); // Clears the first name.
      setLastName(""); // Clears the last name.
      setEmail(""); // Clears the email field.
    } catch (err) {
      setError(err.message || "Unable to connect to the HRMS server."); // Displays the registration error.
    } finally {
      setLoading(false); // Stops the loading indicator.
    }
  }

  // Clears the session and returns to the login screen.
  function handleLogout() {
    sessionStorage.removeItem("hrms_access_token"); // Deletes the access token.
    sessionStorage.removeItem("hrms_refresh_token"); // Deletes the refresh token.
    setUser(null); // Hides the authenticated page.
    setPassword(""); // Clears the password.
    setError(""); // Clears old errors.
    setSuccess(""); // Clears old success messages.
  }

 // Show the dashboard after a successful login.
  if (user) {
    return (
      <Dashboard
      user={user}
      onLogout={handleLogout}
      accessToken={sessionStorage.getItem("hrms_access_token")}
    />
  );
}
  // Displays either the registration form or the login form.
  return (
    <main className="flex min-h-screen bg-slate-100"> {/* Creates the full-page layout. */}
      <section className="hidden w-1/2 flex-col justify-between bg-slate-900 p-12 text-white lg:flex"> {/* Displays branding on large screens. */}
        <div className="flex items-center gap-3"> {/* Arranges the logo and product name. */}
          <div className="rounded-xl bg-blue-600 p-3"><ShieldCheck size={28} /></div> {/* Displays the security icon. */}
          <div>
            <p className="text-xl font-bold">PeopleDesk</p> {/* Shows the application name. */}
            <p className="text-sm text-slate-300">Human Resource Management</p> {/* Shows the product purpose. */}
          </div>
        </div>
        <div className="max-w-lg"> {/* Groups the introduction text. */}
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-300">One workplace. One platform.</p> {/* Shows the tagline. */}
          <h1 className="mt-5 text-5xl font-bold leading-tight">People first.<br />Work smarter.</h1> {/* Displays the main headline. */}
          <p className="mt-6 text-lg leading-8 text-slate-300">Manage employee information, attendance, leave requests, payroll, and reports from one secure workspace.</p> {/* Describes HRMS features. */}
          <div className="mt-8 flex items-center gap-3 text-sm text-slate-300"><Users size={20} /><span>Employee self-service and HR operations</span></div> {/* Highlights employee self-service. */}
        </div>
        <p className="text-sm text-slate-400">HRMS · Secure employee management</p> {/* Shows the footer tagline. */}
      </section>

      <section className="flex w-full items-center justify-center p-5 sm:p-10 lg:w-1/2"> {/* Centers the form. */}
        <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl sm:p-10"> {/* Creates the form card. */}
          <div className="mb-8 flex items-center gap-3 lg:hidden"> {/* Shows branding on small screens. */}
            <div className="rounded-xl bg-blue-600 p-3 text-white"><ShieldCheck size={25} /></div> {/* Displays the mobile logo. */}
            <div>
              <p className="text-lg font-bold text-slate-900">PeopleDesk</p> {/* Shows the mobile product name. */}
              <p className="text-sm text-slate-500">HRMS Portal</p> {/* Shows the portal label. */}
            </div>
          </div>

          <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">{isRegistering ? "Join PeopleDesk" : "Welcome back"}</p> {/* Changes the form label. */}
          <h2 className="mt-2 text-3xl font-bold text-slate-900">{isRegistering ? "Create your account" : "Sign in to HRMS"}</h2> {/* Changes the form heading. */}
          <p className="mt-3 text-sm leading-6 text-slate-500">{isRegistering ? "Register your employee account to get started." : "Enter your account details to continue."}</p> {/* Explains the current form. */}

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="mt-8 space-y-5"> {/* Chooses the correct submit handler. */}
            {isRegistering && ( /* Shows personal details only during registration. */
              <>
                <div>
                  <label htmlFor="firstName" className="mb-2 block text-sm font-semibold text-slate-700">First name</label> {/* Labels the first-name input. */}
                  <input id="firstName" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Enter your first name" className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /> {/* Captures the first name. */}
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-2 block text-sm font-semibold text-slate-700">Last name</label> {/* Labels the last-name input. */}
                  <input id="lastName" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Enter your last name" className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" /> {/* Captures the last name. */}
                </div>
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label> {/* Labels the email input. */}
                  <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your email" className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" required /> {/* Captures and validates the email format. */}
                </div>
              </>
            )}

            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-semibold text-slate-700">Username</label> {/* Labels the username field. */}
              <input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter your username" className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" required /> {/* Captures the username. */}
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">{isRegistering ? "Create password" : "Password"}</label> {/* Labels the password field. */}
              <div className="relative"> {/* Positions the visibility button inside the input area. */}
                <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isRegistering ? "new-password" : "current-password"} minLength={isRegistering ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegistering ? "Create at least 8 characters" : "Enter your password"} className="w-full rounded-lg border border-slate-300 px-4 py-3 pr-12 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" required /> {/* Captures the password and optionally shows it. */}
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button> {/* Toggles password visibility. */}
              </div>
            </div>

            {isRegistering && ( /* Adds password confirmation only to registration. */
              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-slate-700">Confirm password</label> {/* Labels the confirmation field. */}
                <div className="relative"> {/* Positions the confirmation visibility button. */}
                  <input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter the password again" className="w-full rounded-lg border border-slate-300 px-4 py-3 pr-12 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" required /> {/* Captures the confirmation password. */}
                  <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirmation" : "Show confirmation"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900">{showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button> {/* Toggles confirmation visibility. */}
                </div>
              </div>
            )}

            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>} {/* Displays any validation or API error. */}
            {success && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>} {/* Displays successful registration feedback. */}

            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"> {/* Submits the active form. */}
              {isRegistering ? <UserPlus size={18} /> : <LockKeyhole size={18} />} {/* Shows the relevant action icon. */}
              {loading ? (isRegistering ? "Creating account..." : "Signing in...") : (isRegistering ? "Create Employee Account" : "Sign in securely")} {/* Shows progress or action text. */}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600"> {/* Provides a way to switch forms. */}
            {isRegistering ? "Already have an account?" : "New to PeopleDesk?"} {/* Asks the relevant question. */}
            <button type="button" onClick={() => { setIsRegistering((current) => !current); setError(""); setSuccess(""); }} className="ml-2 font-semibold text-blue-700 hover:text-blue-900">{isRegistering ? "Sign in" : "Register"}</button> {/* Switches between login and registration. */}
          </div>

          <p className="mt-8 text-center text-xs leading-5 text-slate-400">Public registration creates an Employee account. Privileged roles must be assigned by an authorized administrator.</p> {/* Explains role restrictions. */}
        </div>
      </section>
    </main>
  );
}