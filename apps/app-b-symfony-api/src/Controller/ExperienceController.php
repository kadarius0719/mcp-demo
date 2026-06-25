<?php

namespace App\Controller;

use App\Entity\Experience;
use App\Repository\ExperienceRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class ExperienceController extends AbstractController
{
    #[Route('/api/experiences', name: 'api_experiences_list', methods: ['GET'])]
    public function list(ExperienceRepository $repo): JsonResponse
    {
        $items = array_map(static fn ($e) => $e->toArray(), $repo->latest());

        return $this->json(['items' => $items, 'total' => count($items)]);
    }

    #[Route('/api/experiences', name: 'api_experiences_create', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];

        $phoneId = (int) ($data['phoneId'] ?? 0);
        $phoneName = trim((string) ($data['phoneName'] ?? ''));
        $rating = (int) ($data['rating'] ?? 0);
        $comment = isset($data['comment']) ? trim((string) $data['comment']) : null;

        // Deterministic by construction: a canonical phone (id + name from App A) is required.
        $errors = [];
        if ($phoneId <= 0 || $phoneName === '') {
            $errors[] = 'A phone must be chosen from the App A catalog (phoneId and phoneName are required).';
        }
        if ($rating < 1 || $rating > 5) {
            $errors[] = 'rating must be between 1 and 5.';
        }
        if ($errors) {
            return $this->json(['errors' => $errors], 422);
        }

        $exp = (new Experience())
            ->setPhoneId($phoneId)
            ->setPhoneName($phoneName)
            ->setRating($rating)
            ->setComment($comment !== '' ? $comment : null);

        $em->persist($exp);
        $em->flush();

        return $this->json($exp->toArray(), 201);
    }
}
