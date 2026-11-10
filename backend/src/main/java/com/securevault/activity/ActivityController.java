package com.securevault.activity;

import com.securevault.activity.ActivityService.ActivityEvent;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/activity")
class ActivityController {

  record ActivityResponse(List<ActivityEvent> events) {}

  private final ActivityService activity;

  ActivityController(ActivityService activity) {
    this.activity = activity;
  }

  @GetMapping
  ActivityResponse list(
      Authentication authentication,
      @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
    return new ActivityResponse(activity.latest(UUID.fromString(authentication.getName()), limit));
  }
}
