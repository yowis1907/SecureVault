package com.securevault.mail;

import com.securevault.common.config.AppProperties;
import org.springframework.stereotype.Component;

/**
 * The text of every email. Tokens go in the URL fragment (after #), which browsers never send to a
 * server or put in a Referer header. The app removes it from the address bar after reading it.
 */
@Component
public class Emails {

  private final Mailer mailer;
  private final AppProperties properties;

  public Emails(Mailer mailer, AppProperties properties) {
    this.mailer = mailer;
    this.properties = properties;
  }

  private String link(String path, String token) {
    return properties.publicUrl().resolve(path) + "#token=" + token;
  }

  public void verifyEmail(String to, String token) {
    mailer.send(
        to,
        "Confirm your SecureVault email address",
        """
        Confirm this address to finish creating your SecureVault account:

        %s

        The link works once and expires in 24 hours. If you did not sign up, ignore this email.
        """
            .formatted(link("/verify-email", token)));
  }

  public void alreadyRegistered(String to) {
    mailer.send(
        to,
        "SecureVault sign-up attempt",
        """
        Someone tried to create a SecureVault account with this email address, which already has
        one. Nothing was changed.

        If it was you, sign in instead. If you have forgotten your account password, use
        "Forgot password" on the sign-in page.
        """);
  }

  public void resetPassword(String to, String token) {
    mailer.send(
        to,
        "Reset your SecureVault account password",
        """
        Use this link to choose a new account password:

        %s

        The link works once and expires in 30 minutes. This resets the account password only.
        Your vault stays protected by your master password, which cannot be reset.

        If you did not ask for this, ignore this email.
        """
            .formatted(link("/reset-password", token)));
  }

  public void passwordWasReset(String to) {
    mailer.send(
        to,
        "Your SecureVault account password was changed",
        """
        Your account password was just reset, and every signed-in session was ended.

        If you did not do this, reset your password again right away.
        """);
  }
}
