<?php

namespace App\Controller;

use App\Repository\PhoneRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Read-only API: the canonical phone list that other apps consume.
 * This is the "set list" App B pulls to constrain its phone field.
 */
class PhoneApiController extends AbstractController
{
    #[Route('/api/phones', name: 'api_phones', methods: ['GET'])]
    public function list(Request $request, PhoneRepository $phones): JsonResponse
    {
        $items = array_map(
            static fn ($p) => $p->toArray(),
            $phones->search($request->query->get('q')),
        );

        return $this->json(['items' => $items, 'total' => count($items)]);
    }
}
