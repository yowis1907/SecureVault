package com.securevault.mail;

/** Sends plain-text email. Tests replace this with a recorder; nothing else is mocked. */
public interface Mailer {

  void send(String to, String subject, String body);
}
