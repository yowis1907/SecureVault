package com.securevault.testsupport;

import com.securevault.mail.Mailer;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Email is the one external boundary replaced in tests. Messages are kept for assertions. */
public final class RecordingMailer implements Mailer {

  public record Message(String to, String subject, String body) {}

  private static final Pattern TOKEN = Pattern.compile("#token=([A-Za-z0-9_-]+)");

  private final List<Message> messages = new CopyOnWriteArrayList<>();

  @Override
  public void send(String to, String subject, String body) {
    messages.add(new Message(to, subject, body));
  }

  public List<Message> to(String address) {
    return messages.stream().filter(m -> m.to().equals(address)).toList();
  }

  /** The token from the newest message to this address that contains a link. */
  public String latestToken(String address) {
    List<Message> mine = to(address);
    for (int i = mine.size() - 1; i >= 0; i--) {
      Matcher matcher = TOKEN.matcher(mine.get(i).body());
      if (matcher.find()) {
        return matcher.group(1);
      }
    }
    throw new AssertionError("No email with a link was sent to " + address);
  }
}
