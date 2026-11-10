package com.securevault.mail;

import com.securevault.common.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * Sends in the background. A failed delivery is logged and otherwise ignored, because a different
 * response for a failed email would reveal that the address belongs to an account.
 */
@Component
class SmtpMailer implements Mailer {

  private static final Logger log = LoggerFactory.getLogger(SmtpMailer.class);

  private final JavaMailSender sender;
  private final AppProperties properties;

  SmtpMailer(JavaMailSender sender, AppProperties properties) {
    this.sender = sender;
    this.properties = properties;
  }

  @Async
  @Override
  public void send(String to, String subject, String body) {
    SimpleMailMessage message = new SimpleMailMessage();
    message.setFrom(properties.mailFrom());
    message.setTo(to);
    message.setSubject(subject);
    message.setText(body);
    try {
      sender.send(message);
    } catch (MailException e) {
      // The address and body stay out of the log: the body can contain a one-time link.
      log.warn("Email delivery failed: subject='{}' error={}", subject, e.getClass().getName());
    }
  }
}
