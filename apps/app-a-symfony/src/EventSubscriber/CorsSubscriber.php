<?php

namespace App\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Minimal permissive CORS for the local demo so the App B React frontend
 * (a different origin) can read this app's read-only API. In production you
 * would scope the allowed origin instead of using "*".
 */
class CorsSubscriber implements EventSubscriberInterface
{
    public static function getSubscribedEvents(): array
    {
        return [
            KernelEvents::REQUEST => ['onRequest', 9999],
            KernelEvents::RESPONSE => ['onResponse', -9999],
        ];
    }

    public function onRequest(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }
        if ($event->getRequest()->getMethod() === 'OPTIONS') {
            $event->setResponse(new Response('', Response::HTTP_NO_CONTENT, $this->headers()));
        }
    }

    public function onResponse(ResponseEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }
        $event->getResponse()->headers->add($this->headers());
    }

    /** @return array<string, string> */
    private function headers(): array
    {
        return [
            'Access-Control-Allow-Origin' => '*',
            'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers' => 'Content-Type',
            'Access-Control-Max-Age' => '3600',
        ];
    }
}
