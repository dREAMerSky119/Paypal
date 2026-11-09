const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateDemoCredentials(email, password) {
  const errors = {};
  const cleanEmail = String(email ?? "").trim();

  if (!cleanEmail) {
    errors.email = "Enter your work email.";
  } else if (!EMAIL_PATTERN.test(cleanEmail)) {
    errors.email = "Enter a valid email address, such as you@agency.com.";
  }

  if (!password) {
    errors.password = "Enter your password to continue.";
  }

  return errors;
}
