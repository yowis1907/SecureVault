package com.securevault.auth;

public record CsrfResponse(String headerName, String token) {}
